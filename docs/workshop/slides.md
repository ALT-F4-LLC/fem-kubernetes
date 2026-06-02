---
marp: true
theme: workshop
class:
  - invert
  - lead
---

# Kubernetes

Production-Grade Container Orchestration

---

# Introduction to Teacher

![welcome](https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExMmFkYjRqZGM3M3Z3ejdkYWt5OWVjaDg1dW8xaTR1Z29sb3JrMHVwOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/QQkyLVLAbQRKU/giphy.gif)

---

## Erik Reinert aka "Blackglasses"

- Senior software engineer
- Content creator (@TheAltF4Stream)
- Diagram & flowchart artist
- Habitual problem solver

---

## Work Experience

- Started with frontend (2+ years)
- Followed curiosity to backend (2+ years)
- Continued curiosity to fullstack (2+ years)
- Found passion in DevOps & Platform Engineering (5+ years - current)

---

## I build things on the internet

- Blog: https://altf4.blog
- Github: https://github.com/ALT-F4-LLC
- Twitch: https://www.twitch.tv/thealtf4stream
- Twitter: https://www.x.com/thealtf4stream
- YouTube: https://www.youtube.com/thealtf4stream
- Vorpal: https://docs.vorpal.build

---

## Existing Courses

- Introduction to DevOps for Developers
- Enterprise Cloud Infrastructure
- Introduction to Backend Architectures
- Cloud Infrastructure: Startup to Scale
- Cloud CI/CD with GitHub Actions

---

# Course Introduction

![intro](https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHNzOTVoMHdsYnQwMzhmaDZvdjB0YmZwZTJkNzhwemU0emZpZmNvdCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3orif7aLUehOfdmlXy/giphy.gif)

---

## One app, two days, three scenarios

- Simple API (Bun/TypeScript) with a Database (Postgres)
- Proof-of-concept: a bare Pod, built the wrong way on purpose
- Stable: declarative manifests you'd hand a teammate
- Production: autoscaled GitOps on a real EKS cluster

---

## Shape of the two days

![h:470 Two-day day-shape: Foundations, POC, Stable on Day 1; Production and the EKS capstone on Day 2](img/diagrams/day-shape.svg)

Same application, climbing one maturity stage at a time.

---

# Kubernetes Mental Model

> "Learn the loop."

---

## The "loop" is the whole idea

- Desired state: what you declare you want
- Actual state: what the cluster reads as real
- Reconciliation: it closes the gap, forever
- Same loop in every resource we build

---

## The loop, drawn plainly

![h:460 The control loop with no analogy: desired state and actual state feed reconciliation, which closes the gap back to desired - forever; a disturbance is driven back by the same self-healing edge](img/diagrams/seg02-loop-defined.svg)

Desired, actual, reconcile - then again. This shape is every resource.

---

## Cruise control is a "loop"

![h:460 Cruise-control loop: set 65 mph desired, sense actual speed, adjust throttle, and hold 65 against a hill as self-healing](img/diagrams/seg02-cruise-control-loop.svg)

You set the speed; the car does everything else to keep it.

---

## The same loop, at kitchen scale

![h:460 Kitchen control loop: tickets are desired state, the head chef is the control plane, line-cook stations are worker nodes cooking the containers](img/diagrams/seg02-kitchen-control-loop.svg)

One brain reads the orders; the stations do the cooking.

---

# Your First Cluster

![first](https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExb3hkM3E1eG9ybDNjN3kxc2hpd3czM3d3aGZudXMyMXBuN25vamc3YSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/26ybwvTX4DTkwst6U/giphy.gif)

---

## Kubernetes is a standard, not a place

- One API for every environment - laptop, cloud, on-prem
- You declare resources; each environment knows how to run them
- A `kind` cluster today, a cloud cluster tomorrow - same manifests
- That standard API is why the same declaration travels

---

## Same resources, different environment

![h:450 kind cluster today versus an EKS cloud cluster on Day 2: the same control plane, workers, storage, and Gateway, backed by different controllers per environment](img/diagrams/seg03-kind-vs-cloud.svg)

The definition stays; the location changes.

---

## The cluster config - one chef, two stations

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 30080
        hostPort: 30080
        protocol: TCP
  - role: worker
  - role: worker
```

One control-plane, two workers; host port 30080 is mapped for the Gateway later.

---

## Create the cluster - one chef, two stations

```bash
$ kind create cluster --config manifests/day-one/kind-cluster.yaml
Creating cluster "kind" ...
 ✓ Starting control-plane
 ✓ Joining worker nodes
Set kubectl context to "kind-kind"
```

`kind` runs each node as a container on your laptop. Run every command from the repo root.

---

## Proof the cluster is live

```bash
$ kubectl get nodes
NAME                 STATUS   ROLES           AGE
kind-control-plane   Ready    control-plane   60s
kind-worker          Ready    <none>          40s
kind-worker2         Ready    <none>          40s
```

Three nodes Ready: one head chef, two cook stations.

---

# Running an app

> "Two peas in a pod."

---

## Run the app as a single bare Pod

```bash
$ kubectl run sample-app \
    --image=docker.io/altf4llc/fem-kubernetes:v1 --port=8080
pod/sample-app created

$ kubectl get pods
NAME         READY   STATUS    RESTARTS   AGE
sample-app   1/1     Running   0          12s
```

`kubectl run` is how you explore, not how you operate (unlike Docker, etc).

---

## Delete it - watch nothing bring it back

```bash
$ kubectl delete pod sample-app
pod "sample-app" deleted

$ kubectl get pods
No resources found in default namespace.
```

Nobody was watching it. So when it's gone, it's gone.

---

## ...where did it go?

![meeseeks](https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExYWJncXZhdXJkZDcya2V5cmYzMHdxaGF4c3Uyd3VmamZiNjBzYWZ0NCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/lpxqmxzQHL7hUejepu/giphy.gif)

Bare `pods` have no controller - so they dissapear.

---

# Deployments & Self-Healing

---

## Deployment watches the Pod for you

```bash
$ kubectl create deployment sample-app \
    --image=docker.io/altf4llc/fem-kubernetes:v1
deployment.apps/sample-app created
```

Deployment is cruise control: declare N, it holds N.

---

## Delete a Pod - this time it heals

```bash
$ kubectl delete pod sample-app-7d9c4b5f8-2xq4r
pod "...-2xq4r" deleted

$ kubectl get pods
NAME                         READY   STATUS    RESTARTS   AGE
sample-app-7d9c4b5f8-9fk2p   1/1     Running   0          4s
```

New name, restored count and you did nothing.

---

## Scaling is one flag

```bash
$ kubectl scale deployment sample-app --replicas=3
deployment.apps/sample-app scaled
```

Change the desired count; the controller reconciles to it.

---

## Postgres joins - ephemeral on purpose

```bash
$ kubectl create deployment postgres \
    --image=postgres:16
$ kubectl set env deployment/postgres \
    POSTGRES_PASSWORD=demo-not-a-real-password \
    POSTGRES_DB=appdb
deployment.apps/postgres env updated
```

No volume: this data dies on restart. We fix that in Stable.

---

# Services & Wiring the App to Postgres

---

## Service is a stable address

```bash
$ kubectl expose deployment postgres \
    --port=5432 --name=postgres
service/postgres exposed
```

Pod IPs rotate; app finds Postgres by the name `postgres` instead.

---

## The secret is handled wrong - say it out loud

```bash
$ kubectl set env deployment/sample-app \
    DB_HOST=postgres \
    DB_PASSWORD=demo-not-a-real-password
deployment.apps/sample-app env updated
```

The app connects fine - the password matches Postgres. It is the *method* that is wrong: the secret is now plaintext in shell history and on this recording. Exactly how not to.

---

## Reach the app, then prove the data dies

```bash
$ kubectl expose deployment sample-app \
    --type=NodePort --port=8080 --name=sample-app

$ kubectl port-forward service/sample-app 8080:8080 &
$ curl localhost:8080/counter     # {"count": 5}
$ kubectl delete pod -l app=postgres
$ curl localhost:8080/counter     # {"count": 1}
```

NodePort is the crude front door; the port-forward is the reliable reach on `kind`. Counter reset to 1: no volume, no durability.

---

## Proof-of-Concept recap - what we built (and broke)

- Nothing in git - every resource is a typed command
- NodePort access - crude, not a real front door
- No health probes, no resource limits
- Postgres data dies on restart - ephemeral by design
- The password is plaintext - insecure by choice

---

## Next: the state you'd hand a teammate

![handshake](https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExOG1jaGV5dmQ5dnlvaG9leGN2M3J4YmZ1ZGpmbnFucmFxN2E2cjF5biZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/2HtWpp60NQ9CU/giphy.gif)

Stable is the list of fixes.

---

# Imperative to Declarative

> "Imperative is for testing; declarative is for scaling."

---

## What is a manifest?

- Previous commands were one-shot, with no record
- A manifest is the desired state, written down
- Reviewable, diffable, recreatable, in git
- Same desired state - now in a file, not your head

---

## Every manifest has the same four fields

```yaml
apiVersion: apps/v1        # which API and version
kind: Deployment           # what kind of resource
metadata:                  # name, labels, namespace
  name: sample-app
spec:                      # the desired state of this object
  replicas: 1
```

`apiVersion` + `kind` pick the type; `metadata` names it; `spec` is what you want.

---

## This is the deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sample-app
  labels:
    app: sample-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: sample-app
  template:
    metadata:
      labels:
        app: sample-app
    spec:
      containers:
        - name: sample-app
          image: docker.io/altf4llc/fem-kubernetes:v1
          ports:
            - containerPort: 8080
          env:
            - name: DB_HOST
              value: postgres
            - name: DB_PASSWORD
              value: demo-not-a-real-password
```

The selector matches the template labels. Plaintext password, still - we fix that in Stable.

---

## Apply is declarative; Diff shows the changes

```bash
$ kubectl diff -f manifests/day-one/deployment.yaml
$ kubectl apply -f manifests/day-one/deployment.yaml
deployment.apps/sample-app created

$ kubectl apply -f manifests/day-one/deployment.yaml
deployment.apps/sample-app unchanged
```

See the change, then apply. Re-applying is a no-op.

---

## Labels and selectors are the wiring

```bash
$ kubectl get deployments,services
NAME                         READY   UP-TO-DATE   AVAILABLE
deployment.apps/postgres     1/1     1            1
deployment.apps/sample-app   1/1     1            1
```

The selector must match the Pod's labels - write both by hand.

---

## The label and the selector must match

```yaml
template:
  metadata:
    labels:
      app: sample-app      # the label stamped on the Pod
spec:
  selector:
    app: sample-app        # the selector that finds it
```

```bash
$ kubectl get pods -l app=sample-app
NAME                         READY   STATUS    RESTARTS   AGE
sample-app-7d9c4b5f8-9fk2p   1/1     Running   0          2m
```

Same `app: sample-app` on both sides - that match is the entire wiring.

---

# Health Checks & Resource Management

---

## Three probes, three different questions

- Readiness: should this Pod get traffic right now?
- Liveness: is this Pod wedged and needing a restart?
- Startup: has the app finished booting yet?
- Requests are for scheduling; limits are for protection

---

## Break /healthz on purpose - watch it heal

```bash
$ kubectl exec deploy/sample-app -- sh -c 'kill -USR1 1'

$ kubectl get pods --watch
NAME                         READY   STATUS    RESTARTS
sample-app-6f4d8c7b9-tq2lp   1/1     Running   0
sample-app-6f4d8c7b9-tq2lp   0/1     Running   0
sample-app-6f4d8c7b9-tq2lp   1/1     Running   1 (5s ago)
```

A running process isn't a working app. The probe knows the difference.

---

## The events name why it restarted

```bash
$ kubectl describe pod -l app=sample-app
Events:
  Warning  Unhealthy  kubelet  Liveness probe failed:
           HTTP probe failed with statuscode: 500
  Normal   Killing    kubelet  Container failed liveness
           probe, will be restarted
```

The loop learned "the app works" is not "the process exists."

---

# ConfigMaps, Secrets & Namespaces

---

## Config and the manifest

- ConfigMap: non-secret config - host, port, db name
- Secret: sensitive values, handled with more care
- Namespace: the app/tooling boundary
- The split is about sensitivity, not mechanism

---

## A namespace for the app

```bash
$ kubectl create namespace app
namespace/app created
```

Everything from here lives in `app`, separate from cluster tooling. Add `-n app` from now on.

---

## Secrets are base64-encoded, NOT encrypted

```bash
$ kubectl create secret generic db-secret -n app \
    --from-literal=DB_PASSWORD=demo-not-a-real-password

$ kubectl get secret db-secret -n app \
    -o jsonpath='{.data.DB_PASSWORD}' | base64 -d
demo-not-a-real-password
```

Came straight back with a standard tool, no key. That's why it stays out of git.

---

# Gateway API

---

## The route is the contract; the controller is local

- Gateway + HTTPRoute declare how traffic reaches the app
- A controller watches them and makes them real
- The route is portable; the controller is per-environment
- gatewayClassName is the one line that names it

---

## Install the controller - three pinned steps

```bash
$ kubectl kustomize "https://github.com/nginx/nginx-gateway-fabric/config/crd/gateway-api/standard?ref=v2.6.3" | kubectl apply -f -
$ kubectl apply -f https://raw.githubusercontent.com/nginx/nginx-gateway-fabric/v2.6.3/deploy/crds.yaml
$ kubectl apply -f https://raw.githubusercontent.com/nginx/nginx-gateway-fabric/v2.6.3/deploy/nodeport/deploy.yaml
```

Gateway API CRDs, then NGF's CRDs, then the controller - it creates its own `nginx` GatewayClass.

---

## Pin the data plane to the mapped port

```bash
$ kubectl patch nginxproxy nginx-gateway-proxy-config -n nginx-gateway --type=merge \
    -p '{"spec":{"kubernetes":{"service":{"nodePorts":[{"port":30080,"listenerPort":80}]}}}}'
```

NGF v2 provisions a data-plane Service per Gateway and auto-allocates its NodePort. Pin it to `30080` so the cluster's host-port-30080 mapping reaches it.

---

## Write the listener and the routing

```bash
$ cat manifests/day-one/k8s/base/gateway.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: sample-app
  namespace: app
spec:
  gatewayClassName: nginx
  listeners:
    - name: http
      protocol: HTTP
      port: 80

$ kubectl apply -f manifests/day-one/k8s/base/gateway.yaml \
    -f manifests/day-one/k8s/base/httproute.yaml
```

`gatewayClassName: nginx` is the only line EKS changes.

---

## The controller wired it up

```bash
$ kubectl get gateway -n app
NAME         CLASS   ADDRESS     PROGRAMMED   AGE
sample-app   nginx   localhost   True         20s

$ curl -H "Host: sample-app.local" \
    http://localhost:30080/healthz
ok
```

Same Gateway and HTTPRoute on EKS - a different controller fulfills them.

---

# Operators & CRDs

---

## A CRD is a new kind; an operator is its loop

- A CRD teaches the API server a new kind
- `kubectl get clusters` becomes as real as `get pods`
- An operator is the control loop that reconciles them
- We consume an operator - we do not write one

---

## Install the operator - no database yet

```bash
$ kubectl apply --server-side -f \
    https://github.com/cloudnative-pg/cloudnative-pg/releases/download/v1.29.1/cnpg-1.29.1.yaml

$ kubectl get crds | grep cnpg
clusters.postgresql.cnpg.io
backups.postgresql.cnpg.io
scheduledbackups.postgresql.cnpg.io

$ kubectl get clusters -A
No resources found
```

The kind exists; nothing has declared one.

---

# Durable Postgres with CloudNativePG

---

## You declare a Cluster; the operator does the rest

- CNPG manages Pods and PVCs like a StatefulSet would
- Plus failover, backups, and safe rolling upgrades
- It generates and owns the credentials - no human did
- The app talks to the `-rw` Service

---

## A few lines of YAML become durable Postgres

```bash
$ cat manifests/day-one/k8s/base/postgres-cluster.yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: postgres
  namespace: app
spec:
  instances: 1
  storage:
    size: 1Gi
    storageClass: standard
  bootstrap:
    initdb:
      database: appdb
      owner: appuser

$ kubectl get cluster postgres -n app
NAME       READY   STATUS                     PRIMARY
postgres   1       Cluster in healthy state   postgres-1
```

StatefulSet's worth of configs - managed for you.

---

## Restart the Pod - the data survives

```bash
$ curl -H "Host: sample-app.local" http://localhost:30080/counter   # {"count": 1}
$ kubectl delete pod postgres-1 -n app
pod "postgres-1" deleted

$ curl -H "Host: sample-app.local" http://localhost:30080/counter   # {"count": 2}
```

The count continued. POC reset to 1 - the PVC outlives the Pod.

---

## ...and this time it survives

![w:480 The data outlived the Pod restart - the exact POC failure, now fixed by a PVC](https://media.giphy.com/media/3o6ZtlYXUF93rBxr1K/giphy.gif)

No human authored the database password.

---

# Organizing Manifests with Kustomize

---

## A base collects manifests into one unit

```bash
$ cat manifests/day-one/k8s/base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: app
resources:
  - deployment.yaml
  - service.yaml
  - configmap.yaml
  - gateway.yaml
  - httproute.yaml
  - postgres-cluster.yaml

$ kubectl apply -k manifests/day-one/k8s/base
```

`kubectl apply -k` is built into kubectl. Base only - overlays are Production.

---

## Stable recap - every proof-of-concept sin, fixed

- Declarative and in git, organized as a Kustomize base
- Probed: readiness, liveness, startup
- Resource-bounded: requests and limits
- Real front door: a Gateway, not a NodePort
- Durably Postgres-backed: data survives a restart

---

## Stable recap - what's still wrong

- Runs on exactly one local cluster
- Scaling is manual
- No safe-rollout or rollback discipline
- Over-permissioned default ServiceAccount
- No story for a node going away

---

# Day 1 Wrap-up

---

## Half of the climb

![h:430 Two-day day-shape with Day 1 highlighted: Foundations, POC, then Stable on kind - Day 2's Production and EKS capstone still ahead](img/diagrams/day-shape.svg)

Imperative POC to declarative Stable - all on one `kind` cluster.

---

## ...you made it through Day 1

![recap](https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExMTduYnFyd2hiamh6eDllNXZodDVibzR3NnFjcmhjN3c2aDNrYm1mYiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/sBLcw5Ic4QUTK/giphy.gif)

Leave the cluster as-is, or check out the `stable` branch tomorrow.

---

## The shape, before we close

![h:430 Two-day day-shape: Foundations, POC, and Stable behind us on Day 1; Production hardening and the EKS capstone ahead on Day 2](img/diagrams/day-shape.svg)

Refresh the whole climb - then look at what Day 2 adds.

---

## Tomorrow: the right-hand column

- Your `kind` cluster is the left-hand, edge end of that picture
- Day 2 is the journey to the managed cloud build
- Production hardens it; the EKS capstone runs it for real

---

# Day 2 Kickoff

---

## Where we left it

- Declarative, in git, organized as a Kustomize base
- Probed, resource-bounded, gateway-fronted
- Durable CNPG Postgres; no human-authored password
- All still on one local `kind` cluster

---

<!-- _class: invert stage-interlude -->

## The Day 2 promise - by 4:15 the same app

- Autoscales under load
- Rolls out safely, with a rollback story
- Is RBAC-scoped, keeps its secrets git-safe
- Is driven by Argo CD from git - and runs on EKS

<!-- ===== SEGMENT 17 · Production · Autoscaling with HPA ===== -->

---

<!-- _class: invert lead stage-production divider -->

# Autoscaling with HPA

Segment 17 - Production

> "The app sizes itself to load - no human typing `scale`."

---

<!-- _class: invert stage-production -->

## The control loop, applied to capacity

- You declare a CPU target; the HPA holds the replica count to it
- `kind` ships no metrics, so `metrics-server` goes in first
- Let it warm up while you walk the spec - `<unknown>` early is just "not scraped yet"
- Percentage is against the Pod's CPU **request** (set back in Stable)

---

<!-- _class: invert stage-production -->

## metrics-server first, then the HPA

```bash
$ kubectl apply -f .../metrics-server/components.yaml
$ kubectl patch deployment metrics-server -n kube-system \
    --type=json -p='[{"op":"add",
    "path":".../args/-","value":"--kubelet-insecure-tls"}]'
deployment.apps/metrics-server patched

$ kubectl autoscale deployment sample-app \
    --cpu-percent=50 --min=1 --max=5
horizontalpodautoscaler.autoscaling/sample-app autoscaled
```

`--kubelet-insecure-tls` is a `kind`-only concession - name it out loud.

---

<!-- _class: invert stage-production -->

## Drive load - watch replicas climb, then settle

```bash
$ kubectl run load --rm -it --image=busybox -- sh -c \
    "while true; do wget -qO- sample-app:8080/<data>; done"

$ kubectl get hpa --watch
NAME         REFERENCE               TARGETS        REPLICAS
sample-app   Deployment/sample-app   cpu: 2%/50%    1
sample-app   Deployment/sample-app   cpu: 180%/50%  1
sample-app   Deployment/sample-app   cpu: 180%/50%  4
sample-app   Deployment/sample-app   cpu: 61%/50%   4
```

It grew under load and shrinks back - scale-down lags on purpose.

<!-- ===== SEGMENT 18 · Production · Safe Rollouts & Rollbacks ===== -->

---

<!-- _class: invert lead stage-production divider -->

# Safe Rollouts & Rollbacks

Segment 18 - Production

---

<!-- _class: invert stage-production -->

## A rolling update, gated by the probe

- `maxSurge` / `maxUnavailable`: replace Pods a few at a time, capacity stays up
- The readiness probe is the interlock - a new Pod counts only once it's ready
- A new version that never gets ready can't proceed: the rollout **stalls**
- A stalled rollout is the guardrail working, not a failure

---

<!-- _class: invert stage-production -->

## Break it on purpose - the rollout stalls

```bash
$ kubectl set image deployment/sample-app \
    sample-app=<registry>/<image>:does-not-exist
$ kubectl rollout status deployment/sample-app --timeout=60s
Waiting for deployment rollout to finish: 1 old replicas...
error: timed out waiting for the condition

$ kubectl get pods
NAME                       READY  STATUS            RESTARTS
sample-app-7d9c4b5f8-2xq4r 1/1    Running           0
sample-app-6c4f9b2a1-pk8wd 0/1    ImagePullBackOff  0
```

New Pod wedged, old Pod still serving - the app is **not** down.

---

<!-- _class: invert lead stage-production -->

## ...it caught it

The bad image is held back; the old version keeps answering. One command to recover:

```bash
$ kubectl rollout undo deployment/sample-app
deployment.apps/sample-app rolled back
deployment "sample-app" successfully rolled out
```

`undo` reverts to the last known-good ReplicaSet - already on disk.

<!-- ===== SEGMENT 19 · Production · PodDisruptionBudgets & Node Drains ===== -->

---

<!-- _class: invert lead stage-production divider -->

# PodDisruptionBudgets & Node Drains

Segment 19 - Production

---

<!-- _class: invert stage-production -->

## Voluntary disruption is the kind you can plan for

- Involuntary (a node crashes) - you only heal afterward
- Voluntary (an admin drains for maintenance) - a PDB can hold it back
- A PDB says "never fewer than N app Pods available"
- `drain` cordons the node and evicts politely, honoring the PDB

---

<!-- _class: invert stage-production -->

## A floor of replicas, then a budget

```bash
$ kubectl scale deployment sample-app --replicas=3
$ kubectl create poddisruptionbudget sample-app \
    --selector=app=sample-app --min-available=2
poddisruptionbudget.policy/sample-app created

$ kubectl get pdb
NAME         MIN AVAILABLE   ALLOWED DISRUPTIONS   AGE
sample-app   2               1                     10s
```

`ALLOWED DISRUPTIONS` is how many can go right now without breaching.

---

<!-- _class: invert lead stage-production -->

## Drain the node - the app keeps answering

```bash
$ kubectl drain kind-worker \
    --ignore-daemonsets --delete-emptydir-data
node/kind-worker cordoned
pod/sample-app-7d9c4b5f8-2xq4r evicted
node/kind-worker drained

$ curl -H "Host: sample-app.local" localhost/healthz
ok
```

The node went out for maintenance - a user would never have known.

<!-- ===== SEGMENT 20 · Production · RBAC & Least Privilege ===== -->

---

<!-- _class: invert lead stage-production divider -->

# RBAC & Least Privilege

Segment 20 - Production

---

<!-- _class: invert stage-production -->

## Give the workload its job - and nothing more

- It's been running under the namespace's broad `default` ServiceAccount
- Role = allowed verbs on resources; RoleBinding ties a Role to a subject
- This app only reads its own ConfigMap - that's the entire grant
- It never calls the API, so don't even mount a token

---

<!-- _class: invert stage-production -->

## A dedicated identity, scoped tight

```bash
$ kubectl create serviceaccount sample-app
$ kubectl patch serviceaccount sample-app \
    -p '{"automountServiceAccountToken": false}'

$ kubectl create role sample-app \
    --verb=get,list --resource=configmaps
$ kubectl create rolebinding sample-app \
    --role=sample-app --serviceaccount=app:sample-app
$ kubectl set serviceaccount deployment/sample-app sample-app
```

ServiceAccount, Role, RoleBinding, then assign it to the Deployment.

---

<!-- _class: invert stage-production -->

## Prove the blast radius

```bash
$ kubectl auth can-i get configmaps \
    --as=system:serviceaccount:app:sample-app
yes

$ kubectl auth can-i get secrets \
    --as=system:serviceaccount:app:sample-app
no
```

Compromise this Pod and the cluster blast radius is exactly that Role.

<!-- ===== SEGMENT 21 · Production · GitOps with Argo CD ===== -->

---

<!-- _class: invert lead stage-production divider -->

# GitOps with Argo CD

Segment 21 - Production

---

<!-- _class: invert stage-production -->

## The cruise-control loop, with git as the dial

- Git is the desired state; Argo CD drives the cluster to match - forever
- You stop running `apply` - you commit, the reconciler applies
- One Argo CD per cluster, managing the cluster it lives in
- Budget reality: install + **one** synced app; drift demo if time allows

---

<!-- _class: invert stage-production -->

## Install Argo CD, point an Application at the base

```bash
$ kubectl create namespace argocd
$ kubectl apply -n argocd -f .../argo-cd/.../install.yaml

$ kubectl apply -n argocd -f - <<'EOF'
kind: Application
spec:
  source: { repoURL: <repo>, path: k8s/base }
  destination:
    server: https://kubernetes.default.svc
  syncPolicy: { automated: { selfHeal: true } }
EOF
```

`destination.server` is the in-cluster API - no external registration.

---

<!-- _class: invert stage-production -->

## Drift: the loop catches a hand-edit

```bash
$ kubectl scale deployment sample-app --replicas=4
$ kubectl get application sample-app -n argocd
NAME         SYNC STATUS   HEALTH STATUS
sample-app   OutOfSync     Healthy

$ kubectl get deployment sample-app
NAME         READY   UP-TO-DATE   AVAILABLE
sample-app   2/2     2            2
```

`selfHeal` reverts the manual change - git won, no one applied it.

<!-- ===== SEGMENT 22 · Interlude · Lunch ===== -->

---

<!-- _class: invert lead stage-interlude divider -->

# Lunch

Segment 22 - Interlude

Back at 12:45 - the afternoon takes the same app to the cloud.

<!-- ===== SEGMENT 23 · Production · GitOps Secrets with Sealed Secrets ===== -->

---

<!-- _class: invert lead stage-production divider -->

# GitOps Secrets with Sealed Secrets

Segment 23 - Production

---

<!-- _class: invert stage-production -->

## First two minutes: start EKS in the background

- `eksctl create cluster` now - a control plane takes 15-20 min
- It provisions unattended while this whole segment stays on `kind`
- base64 is not encryption - that's why the Secret was kept out of git
- Sealed Secrets is the operator pattern again, doing one thing: decrypt

---

<!-- _class: invert stage-production -->

## Kick it off, then switch back to kind

```bash
$ eksctl create cluster -f eks-cluster.yaml
... building cluster stack "eksctl-fem-workshop-cluster"
... deploying stack ...  # ~15-20 min, unattended

$ kubectl config use-context kind-kind
Switched to context "kind-kind".

$ kubectl apply -f .../sealed-secrets/.../controller.yaml
deployment.apps/sealed-secrets-controller created
```

Leave EKS building; do not wait on it - teach while it provisions.

---

<!-- _class: invert stage-production -->

## Seal the Secret - plaintext stays local

```bash
$ kubectl create secret generic db-extra -n app \
    --from-literal=password=demo-not-a-real-password \
    --dry-run=client -o yaml > db-extra-secret.yaml

$ kubeseal --controller-namespace kube-system \
    --format yaml < db-extra-secret.yaml \
    > sealed-db-extra.yaml

$ rm db-extra-secret.yaml   # never commit the plaintext
```

`demo-not-a-real-password` is a throwaway - the app never reads it.

---

<!-- _class: invert lead stage-production -->

## The ciphertext is git-safe

```bash
$ grep -A1 encryptedData sealed-db-extra.yaml
  encryptedData:
    password: AgBvA3f9...ciphertext-not-the-password...==

$ kubectl apply -f sealed-db-extra.yaml
sealedsecret.bitnami.com/db-extra created

$ kubectl get sealedsecret,secret db-extra -n app
sealedsecret.bitnami.com/db-extra   15s
secret/db-extra      Opaque   1      14s
```

Commit the `SealedSecret`; the controller decrypts it in-cluster.

<!-- ===== SEGMENT 24 · Production · Going to the Cloud: Your EKS Cluster ===== -->

---

<!-- _class: invert lead stage-production divider -->

# Going to the Cloud: Your EKS Cluster

Segment 24 - Production

---

<!-- _class: invert stage-production -->

## The cluster from segment 23 is up - no wait

- EKS runs the control plane: API server, etcd, scheduler - all managed
- You own the worker nodes and the workloads; never SSH the control plane
- One cluster at a time - we *migrate* to EKS, we don't federate
- It bills by the hour - which is exactly why segment 30 tears it down

---

<!-- _class: invert stage-production -->

## Switch context, confirm the nodes are real EC2

```bash
$ kubectl config use-context <acct>@fem-workshop...eksctl.io
Switched to context "...eksctl.io".

$ kubectl get nodes
NAME                          STATUS   ROLES    AGE
ip-192-168-12-34...internal   Ready    <none>   3m
ip-192-168-56-78...internal   Ready    <none>   3m
```

The context switch is what moves every command to the cloud.

---

<!-- _class: invert stage-production -->

## Up, but bare - name the gaps

```bash
$ kubectl get storageclass
NAME   PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE
gp2    kubernetes.io/aws-ebs   Delete          WaitForFirstConsumer
```

- No local-path provisioner - storage is the next gap (25)
- No Gateway controller - networking after that (26)
- No Sealed Secrets controller yet - its own key comes in 28

<!-- ===== SEGMENT 25 · Production · Cluster Storage & the EBS CSI Driver ===== -->

---

<!-- _class: invert lead stage-production divider -->

# Cluster Storage & the EBS CSI Driver

Segment 25 - Production

---

<!-- _class: invert stage-production -->

## The PVC is the contract; the provisioner is environmental

- A PVC is a stable request - "10Gi of durable storage"
- `kind` answered it with local-path; EKS answers with EBS CSI
- gp3 over the default gp2 - better baseline, decoupled IOPS
- `WaitForFirstConsumer`: bind the zonal volume where the Pod lands

---

<!-- _class: invert stage-production -->

## Driver as a managed add-on, then a gp3 class

```bash
$ eksctl create addon --name aws-ebs-csi-driver \
    --cluster fem-workshop --region <region> --force
... addon "aws-ebs-csi-driver" active

$ kubectl apply -f - <<'EOF'
kind: StorageClass
metadata:
  name: gp3
  annotations: { ...is-default-class: "true" }
provisioner: ebs.csi.aws.com
volumeBindingMode: WaitForFirstConsumer
parameters: { type: gp3 }
EOF
storageclass.storage.k8s.io/gp3 created
```

---

<!-- _class: invert lead stage-production -->

## The unchanged CNPG manifest binds to real EBS

```bash
$ kubectl get pvc -n app
NAME         STATUS   VOLUME      CAPACITY   STORAGECLASS
postgres-1   Bound    pvc-a1b2c3  10Gi       gp3

$ aws ec2 describe-volumes --region <region> \
    --filters Name=tag:...pvc/name,Values=postgres-1 \
    --query 'Volumes[].{ID:VolumeId,Type:VolumeType}'
[ { "ID": "vol-0abc123def456", "Type": "gp3" } ]
```

Same Postgres manifest - manifest portable, storage class environmental.

<!-- ===== SEGMENT 26 · Production · Cloud Networking & the AWS Load Balancer Controller ===== -->

---

<!-- _class: invert lead stage-production divider -->

# Cloud Networking & the AWS Load Balancer Controller

Segment 26 - Production

---

<!-- _class: invert stage-production -->

## The callback: route is a contract, controller is environmental

- Same lesson as storage - now for the front door
- On `kind`, NGINX Gateway Fabric fulfilled the `Gateway`/`HTTPRoute`
- On EKS, the AWS LB Controller turns the same YAML into a real ALB
- A `GatewayClass` names which controller picks up the `Gateway`

---

<!-- _class: invert stage-production -->

## Install: IAM, then cert-manager + CRDs + controller

```bash
$ eksctl create iamserviceaccount --cluster fem-workshop \
    --namespace kube-system \
    --name aws-load-balancer-controller --approve
... created serviceaccount

$ kubectl apply --validate=false -f .../cert-manager.yaml
$ kubectl apply -f .../gateway-crds.yaml
$ kubectl apply -f .../v3_X_Y_full.yaml   # pin v3.0.0+
deployment.apps/aws-load-balancer-controller created
```

`v3_X_Y_full.yaml` is a placeholder - apply your pinned version.

---

<!-- _class: invert stage-production -->

## ALB config is type-safe CRDs, not annotations

```bash
$ kubectl apply -f - <<'EOF'
kind: LoadBalancerConfiguration   # the scheme
spec: { scheme: internet-facing }
---
kind: GatewayClass
spec:
  controllerName: gateway.k8s.aws/alb
  parametersRef: { kind: LoadBalancerConfiguration, ... }
EOF
gatewayclass.gateway.networking.k8s.io/alb created
```

The old `Ingress` smeared `alb.ingress.*` annotations - now real objects.

---

<!-- _class: invert lead stage-production -->

## Same Gateway + HTTPRoute → a real ALB

```bash
$ kubectl apply -f - <<'EOF'
kind: Gateway
spec: { gatewayClassName: alb, listeners: [...] }
EOF
gateway.../sample-app created

$ kubectl get gateway sample-app -n app
NAME         CLASS   ADDRESS                       PROGRAMMED
sample-app   alb     k8s-sampleapp-xxxx...elb...    True

$ curl http://k8s-sampleapp-xxxx...elb.amazonaws.com/healthz
ok
```

Only `gatewayClassName` changed - contract unchanged, controller environmental.

<!-- ===== SEGMENT 27 · Production · Environment Overlays with Kustomize ===== -->

---

<!-- _class: invert lead stage-production divider -->

# Environment Overlays with Kustomize

Segment 27 - Production

---

<!-- _class: invert stage-production -->

## Two overlays over the untouched segment-14 base

- The base stays exactly as it is - overlays patch, never rewrite
- An overlay = a few patches + a reference to the base
- `kind`: local-path, `nginx` class, low replicas
- `eks`: gp3, `alb` class, higher replicas - express difference, not two live clusters

---

<!-- _class: invert stage-production -->

## The eks overlay names the base and its patches

```bash
$ cat > overlays/eks/kustomization.yaml <<'EOF'
resources:
  - ../../base
patches:
  - path: gateway-class-alb.yaml
    target: { kind: Gateway, name: sample-app }
  - path: storageclass-gp3.yaml
    target: { kind: Cluster, name: postgres }
  - path: replicas-4.yaml
    target: { kind: Deployment, name: sample-app }
EOF
```

`overlays/kind/` does the same with the `nginx` class and replicas-2.

---

<!-- _class: invert lead stage-production -->

## Diff proves the base is untouched

```bash
$ diff <(kubectl kustomize k8s/base) \
       <(kubectl kustomize overlays/eks) | head
<     gatewayClassName: nginx
>     gatewayClassName: alb
<   replicas: 2
>   replicas: 4
>   storageClass: gp3
```

A handful of lines - that's the entire `kind`-to-cloud delta.

<!-- ===== SEGMENT 28 · Production · GitOps on EKS ===== -->

---

<!-- _class: invert lead stage-production divider -->

# GitOps on EKS

Segment 28 - Production

---

<!-- _class: invert stage-production -->

## Argo CD lives in the cluster it manages - so EKS gets its own

- Same install as segment 21, on EKS, reconciling the `eks` overlay
- No external-cluster registration, no fan-out - one Argo CD per cluster
- The `kind`-sealed Secret can't decrypt here: keys are per-cluster
- So EKS installs its own controller and seals its own copy

---

<!-- _class: invert stage-production -->

## Seal the EKS copy - stdin, no plaintext on disk

```bash
$ kubectl config current-context   # must be EKS
<acct>@fem-workshop...eksctl.io

$ kubectl apply -f .../sealed-secrets/.../controller.yaml

$ kubectl create secret generic db-extra -n app \
    --from-literal=password=demo-not-a-real-password \
    --dry-run=client -o yaml \
  | kubeseal --controller-namespace kube-system --format yaml \
  > overlays/eks/sealed-db-extra.yaml
```

Piping into `kubeseal` beats write-then-`rm` - nothing to forget on disk.

---

<!-- _class: invert lead stage-production -->

## Application points at the eks overlay, syncs from git

```bash
$ kubectl apply -n argocd -f - <<'EOF'
kind: Application
spec:
  source: { repoURL: <repo>, path: overlays/eks }
  destination:
    server: https://kubernetes.default.svc
  syncPolicy: { automated: { selfHeal: true } }
EOF

$ kubectl get application sample-app -n argocd
NAME         SYNC STATUS   HEALTH STATUS
sample-app   Synced        Healthy
```

`path: overlays/eks` - point at `base` and EKS gets the `kind` values.

<!-- ===== SEGMENT 29 · Production · Built-in & Platform Observability ===== -->

---

<!-- _class: invert lead stage-production divider -->

# Built-in & Platform Observability

Segment 29 - Production

---

<!-- _class: invert stage-production -->

## Get a long way before a metrics stack earns its weight

- `kubectl top` - live CPU/memory per Pod and node, from `metrics-server`
- Events - the cluster's running narration of what happened and why
- `kubectl rollout status` - observability for deploys, not just debugging
- EKS CloudWatch Container Insights - the platform's own metrics sink

---

<!-- _class: invert stage-production -->

## The built-in signals, no install

```bash
$ kubectl top pods -n app
NAME                          CPU(cores)   MEMORY(bytes)
sample-app-7d9c4b5f8-2xq4r    4m           38Mi
postgres-1                    12m          120Mi

$ kubectl get events -n app --sort-by=.lastTimestamp | tail
LAST SEEN   TYPE     REASON          OBJECT         MESSAGE
2m          Normal   Scheduled       pod/sample     Assigned...
90s         Normal   SyncSucceeded   app/sample     synced
```

---

<!-- _class: invert stage-production -->

## The platform option, then stop

```bash
$ aws eks create-addon --cluster-name fem-workshop \
    --region <region> \
    --addon-name amazon-cloudwatch-observability
{ "addon": { "status": "CREATING" } }
```

We stop here on purpose: a Prometheus/Grafana/Loki stack is its own thing to run, scale, secure, and pay for - reach for it when built-in and platform signals stop being enough, not by default.

<!-- ===== SEGMENT 30 · Production · Tearing It Down ===== -->

---

<!-- _class: invert lead stage-production divider -->

# Tearing It Down

Segment 30 - Production

---

<!-- _class: invert stage-production -->

## Cleanup is operational discipline, not tidying

- Control plane, nodes, EBS volumes, ALB - each bills by the hour
- `eksctl delete cluster` removes what `eksctl` created
- Orphans come from what it *didn't* create - the ALB and the EBS volumes
- The rule is two steps: delete, then **verify**

---

<!-- _class: invert stage-production -->

## Delete, then check for orphans

```bash
$ eksctl delete cluster -f eks-cluster.yaml --region <region>
... deleting EKS cluster "fem-workshop"

$ aws elbv2 describe-load-balancers --region <region> \
    --query 'LoadBalancers[?contains(...,`k8s-sampleapp`)]'
[]

$ aws ec2 describe-volumes --region <region> \
    --filters Name=...cluster/fem-workshop,Values=owned \
              Name=status,Values=available
[]
```

Two empty lists - the clean case, and the one to make students see.

---

<!-- _class: invert lead stage-production -->

## A cluster you forget about is a bill you didn't budget for

The single most common cloud-workshop regret is the cluster that ran for a week after everyone went home. The verification is how you guarantee it doesn't happen to anyone in the room.

```bash
$ eksctl get cluster --region <region>
No clusters found in <region>.
```

Down, verified clean, nothing billing - no one leaves Day 2 with a live cluster.

<!-- ===== SEGMENT 31 · Production · Day 2 Recap: End of Production ===== -->

---

<!-- _class: invert lead stage-production divider -->

# Day 2 Recap: End of Production

Segment 31 - Production

---

<!-- _class: invert stage-production -->

## What Production added - hardened, then cloud

- **Autoscaling:** an HPA sizes the app to CPU load, up and back down
- **Safe rollouts:** readiness-gated, with `rollout undo` to a known-good
- **Drain survival:** a PDB plus replicas keeps serving through `drain`
- **Least privilege:** a scoped ServiceAccount, Role, and RoleBinding

---

<!-- _class: invert stage-production -->

## ...and made it cloud-native and git-driven

- **GitOps:** Argo CD reconciles git and self-heals drift - no hand-applies
- **Git-safe secrets:** Sealed Secrets, each cluster sealing its own copy
- **Migrated to EKS over the same base:** EBS storage, an ALB, an `eks` overlay
- One cluster at a time - then torn down clean, nothing left billing

---

<!-- _class: invert stage-production -->

## The theme paid off end to end

- The same PVC bound to local-path on `kind`, to EBS on EKS
- The same `Gateway`/`HTTPRoute` ran behind NGINX, then a real ALB
- The same Kustomize base ran on both via environment overlays
- Route was the contract; the controller behind it was environmental

<!-- ===== SEGMENT 32 · Interlude · Wrap-Up ===== -->

---

<!-- _class: invert lead stage-interlude divider -->

# Wrap-Up

Segment 32 - Interlude

---

<!-- _class: invert stage-interlude -->

## The whole climb, drawn once more

![h:430 The full two-day day-shape: Foundations and POC into Stable on Day 1, then Production hardening and the EKS capstone on Day 2 - one application rising through every stage](img/diagrams/day-shape.svg)

One app rode from a bare Pod to autoscaled GitOps on a real cloud cluster.

---

<!-- _class: invert stage-interlude -->

## The diff between stages is the workshop

- **Kubernetes docs** - the API reference for everything you touched
- **CloudNativePG docs** - the operator behind durable Postgres in Stable
- **Argo CD + Sealed Secrets docs** - the GitOps and secrets tooling
- **Stage branches** `poc` / `stable` / `production` - each stage's exact end-state

---

<!-- _class: invert lead stage-interlude -->

## ...go run your own clusters on Monday

![w:440 A closing recap beat - two days done, the full maturity arc behind you](https://media.giphy.com/media/3ornk57KwDXf81rjWM/giphy.gif)

Same bricks, three builds - now you know which posture fits which context.
