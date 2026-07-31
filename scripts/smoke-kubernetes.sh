#!/usr/bin/env bash
set -euo pipefail

cluster="domino-smoke-${GITHUB_RUN_ID:-local}-$$"
port_forward_pid=""
cleanup() {
  if [[ -n "$port_forward_pid" ]]; then
    kill "$port_forward_pid" >/dev/null 2>&1 || true
  fi
  kind delete cluster --name "$cluster" >/dev/null 2>&1 || true
}
trap cleanup EXIT

kind create cluster \
  --name "$cluster" \
  --image kindest/node:v1.36.1@sha256:3489c7674813ba5d8b1a9977baea8a6e553784dab7b84759d1014dbd78f7ebd5 \
  --wait 120s
kind load docker-image --name "$cluster" domino:ci domino-migrate:ci

kubectl apply -f deploy/k8s/namespace.yaml
kubectl apply -f src/test/k8s/postgres.yaml
kubectl -n domino create secret generic domino \
  --from-literal=database-url='postgres://domino:kubernetes-smoke-password@postgres.domino.svc.cluster.local:5432/domino' \
  --from-literal=paperless-token='' \
  --from-literal=oidc-client-secret='' \
  --from-literal=session-secret='kubernetes-session-secret-longer-than-32-characters' \
  --from-literal=credential-encryption-key='kubernetes-credential-key-longer-than-32-characters'
kubectl apply -f deploy/k8s/configmap.yaml
kubectl apply -f deploy/k8s/pvc.yaml
kubectl apply -f deploy/k8s/service.yaml
kubectl apply -f deploy/k8s/network-policy.yaml
kubectl -n domino rollout status deployment/postgres --timeout=120s

sed \
  -e 's#ghcr.io/hankandre/domino-migrate:0.2.0#domino-migrate:ci#' \
  -e 's/imagePullPolicy: Always/imagePullPolicy: IfNotPresent/' \
  deploy/k8s/migrate-job.yaml | kubectl apply -f -
kubectl -n domino wait --for=condition=complete job/domino-migrate-0-2-0 --timeout=120s

sed \
  -e 's#ghcr.io/hankandre/domino:0.2.0#domino:ci#' \
  -e 's/imagePullPolicy: Always/imagePullPolicy: IfNotPresent/' \
  deploy/k8s/deployment.yaml | kubectl apply -f -
kubectl -n domino rollout status deployment/domino --timeout=180s
kubectl -n domino wait --for=jsonpath='{.status.phase}'=Running pod -l app.kubernetes.io/component=application --timeout=60s
test "$(kubectl -n domino get pvc domino-uploads -o jsonpath='{.status.phase}')" = "Bound"
test "$(kubectl -n domino get networkpolicy domino -o jsonpath='{.spec.policyTypes[*]}')" = "Ingress Egress"

# Restricted Pod Security must reject an intentionally privileged pod.
if kubectl -n domino apply -f - >/dev/null 2>&1 <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: privileged-must-fail
spec:
  containers:
    - name: shell
      image: busybox:1.37
      securityContext:
        privileged: true
EOF
then
  echo "Restricted Pod Security unexpectedly admitted a privileged pod."
  exit 1
fi

kubectl -n domino port-forward service/domino 18080:80 >/tmp/domino-port-forward.log 2>&1 &
port_forward_pid="$!"
for _ in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:18080/api/ready >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl --fail --silent http://127.0.0.1:18080/api/ready | grep -q '"database":"ready"'

# Create a second Deployment revision, roll it out, then exercise rollback.
kubectl -n domino set env deployment/domino DOMINO_SMOKE_REVISION=two
kubectl -n domino rollout status deployment/domino --timeout=120s
kubectl -n domino rollout undo deployment/domino
kubectl -n domino rollout status deployment/domino --timeout=120s

echo "Kubernetes fresh install, migration, restricted admission, PVC, policy, rollout, and rollback passed."
