#!/usr/bin/env bash
# Corre las pruebas de navegador de Bidware contra Fr8Bid (vite en modo rateware
# con un Supabase de mentira). Uso: test/bidware-navegador/correr.sh [archivo...]
cd "$(dirname "$0")/../.."
ORIGEN=${TEST_ORIGIN:-http://127.0.0.1:3300}
archivos=("$@"); [ ${#archivos[@]} -eq 0 ] && archivos=(test/bidware-navegador/*.browser.* test/bidware-navegador/*.reproduce.mjs)
ok=0; mal=0
for f in "${archivos[@]}"; do
  log=.test-output/navegador/$(basename "$f").log; mkdir -p .test-output/navegador
  if TEST_ORIGIN=$ORIGEN TEST_OUTPUT=.test-output/navegador/$(basename "$f") timeout 240 node -r ./test/bidware-navegador/adaptador.cjs "$f" > "$log" 2>&1; then echo "PASA  $f"; ok=$((ok+1)); else echo "FALLA $f"; mal=$((mal+1)); fi
done
echo "pasan $ok · fallan $mal"
