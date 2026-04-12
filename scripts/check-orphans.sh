#!/bin/bash
# Check for orphaned processes that are consuming excessive resources.
# Intended to run via cron. Outputs JSON for the NanoClaw scheduled task pre-check pattern.
# Exit silently if nothing is wrong.

ORPHANS=()

# Check for bun/node processes running > 6 hours with > 30% CPU
while IFS= read -r line; do
  pid=$(echo "$line" | awk '{print $2}')
  cpu=$(echo "$line" | awk '{print $3}')
  mem=$(echo "$line" | awk '{print $4}')
  elapsed=$(echo "$line" | awk '{print $10}')
  cmd=$(echo "$line" | awk '{for(i=11;i<=NF;i++) printf "%s ", $i; print ""}')

  # Parse elapsed time (format: [[DD-]HH:]MM:SS)
  hours=0
  if [[ "$elapsed" == *-* ]]; then
    days=${elapsed%%-*}
    hours=$((days * 24))
  elif [[ "$elapsed" =~ ^[0-9]+:[0-9]+:[0-9]+$ ]]; then
    hours=$(echo "$elapsed" | cut -d: -f1)
  fi

  # Flag if running > 6 hours AND using > 20% CPU (likely stuck/orphaned)
  cpu_int=${cpu%.*}
  if [ "$hours" -ge 6 ] && [ "$cpu_int" -ge 20 ]; then
    ORPHANS+=("{\"pid\":$pid,\"cpu\":\"$cpu\",\"mem\":\"$mem\",\"elapsed\":\"$elapsed\",\"cmd\":\"$(echo "$cmd" | head -c 80)\"}")
  fi
done < <(ps -eo user,pid,pcpu,pmem,vsz,rss,tty,stat,start,etime,args --sort=-pcpu | grep -E "^nanoclaw.*(bun|node|claude)" | grep -v grep)

# Check memory pressure
FREE_MB=$(free -m | awk '/^Mem:/ {print $7}')
SWAP_USED_MB=$(free -m | awk '/^Swap:/ {print $3}')

MEMORY_WARNING=""
if [ "$FREE_MB" -lt 100 ] && [ "$SWAP_USED_MB" -gt 500 ]; then
  MEMORY_WARNING="Low memory: ${FREE_MB}MB available, ${SWAP_USED_MB}MB swap used"
fi

# Output
if [ ${#ORPHANS[@]} -eq 0 ] && [ -z "$MEMORY_WARNING" ]; then
  echo '{"status":"ok","orphans":[],"memoryWarning":null}'
else
  ORPHAN_JSON=$(IFS=,; echo "[${ORPHANS[*]}]")
  MEM_JSON="null"
  [ -n "$MEMORY_WARNING" ] && MEM_JSON="\"$MEMORY_WARNING\""
  echo "{\"status\":\"warning\",\"orphans\":$ORPHAN_JSON,\"memoryWarning\":$MEM_JSON}"
fi
