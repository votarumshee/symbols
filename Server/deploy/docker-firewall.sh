#!/bin/bash
set -euo pipefail
# Docker's iptables backend: enforce the public ingress policy before Docker DNAT accepts.
for fw in iptables ip6tables; do
  "$fw" -w -N SYMBOLS-INGRESS 2>/dev/null || true
  "$fw" -w -F SYMBOLS-INGRESS
  "$fw" -w -A SYMBOLS-INGRESS -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
  "$fw" -w -A SYMBOLS-INGRESS -p tcp -m conntrack --ctorigdstport 80 -j RETURN
  "$fw" -w -A SYMBOLS-INGRESS -p tcp -m conntrack --ctorigdstport 443 -j RETURN
  "$fw" -w -A SYMBOLS-INGRESS -p udp -m conntrack --ctorigdstport 443 -j RETURN
  "$fw" -w -A SYMBOLS-INGRESS -j DROP
  "$fw" -w -C DOCKER-USER -i eth0 -j SYMBOLS-INGRESS 2>/dev/null || "$fw" -w -I DOCKER-USER 1 -i eth0 -j SYMBOLS-INGRESS
done
