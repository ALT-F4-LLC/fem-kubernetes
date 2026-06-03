# Production — Instructor Guide

This is the **Production** stage of the workshop — OUTLINE segments 17-21 (Day-2 morning, 9:45-12:00) and 23-31 (Day-2 afternoon, 12:45-4:15), authored as one continuous stage. It is the longest stage and the workshop's capstone. By the end, the same app that started as a bare Pod autoscales on demand, rolls out safely and rolls back on failure, survives a node drain, runs under a least-privilege ServiceAccount, keeps its secrets git-safe with Sealed Secrets, is reconciled from git by Argo CD, and has been **migrated from the local `kind` cluster onto a real Amazon EKS cluster** via a Kustomize overlay over the same base — the state you would hand to an on-call rotation. The morning hardens the app on `kind`; the afternoon stands it up in the cloud. Segment 22 between the two bands is the lunch interlude and has no entry here. Segment 16, the Day 2 Kickoff interlude that opens this stage, is folded in directly below as the Opening framing.

**Opening framing (folded in from segment 16, the Day 2 Kickoff interlude).** This stage opens Day 2, so the instructor carries the workshop's promise back in after students have left overnight. Recap where Stable left off: the same small app is now declarative, health-probed, resource-bounded, fronted by a gateway, and durably backed by CNPG-managed Postgres — the teammate-ready state, running on one local `kind` cluster. Confirm everyone still has a working `stable` cluster, or help them check out the `stable` branch to catch up. Then name the Day 2 promise out loud: by 4:15 that same app autoscales under load, rolls out safely (and rolls back in one command), survives node drains, is RBAC-scoped to a least-privilege ServiceAccount, keeps its secrets git-safe with Sealed Secrets, is driven by Argo CD from git, and runs on a real Amazon EKS cluster. Everything below earns that promise one segment at a time.

**Stage at a glance.**
- **Delivers:** autoscaling (HPA), safe rollout and one-command rollback, node-drain survival, a least-privilege ServiceAccount, git-safe Sealed Secrets, GitOps reconciliation via Argo CD, and the migration onto a real Amazon EKS cluster.
- **End state:** the state you'd hand an on-call rotation — autoscaled, safely deployable, drain-resilient, least-privileged, GitOps-driven, git-safe on secrets — running on EKS.
- **Next:** this is the capstone — nothing is deferred to a later stage; the mandatory teardown closes Day 2 cleanly.

**How to read this guide.** Each segment below follows the same fixed section order — `Goal`, `Talking points`, `Live build`, `Watch for`, an optional `Anticipated questions`, then `Transition` — so your eye lands in the same place every time. The fenced command blocks are exactly what you type on stage; one logical step per block, with prose between blocks narrating the build. Output blocks are **representative, not literal captures** — pod-name suffixes, ages, IPs, AWS ARNs, and EKS endpoint hostnames are illustrative and will differ on the day; read them for the shape and the teaching signal, never as the exact bytes you'll see. Every secret value shown anywhere is a deliberately-fake demo value. The install-manifest URLs that point at `stable`/`latest` (metrics-server, Argo CD, Sealed Secrets) are **illustrative** — on stage you apply the specific version you pinned in the pre-flight checklist, not the moving `stable`/`latest` target (these three resolve as-is). The AWS Load Balancer Controller URL goes further: its `latest/download/v3_X_Y_full.yaml` filename is itself a placeholder that does **not** resolve — a literal paste 404s — so it must be replaced with the pinned version filename (see segment 26).

> **Scope guard — keep these in mind on stage.**
>
> **Stage design choices that bind Production (enforce these):**
> - **One cluster at a time — this afternoon is a migration, not a fleet.** `kind` carries the morning; EKS carries the afternoon. The `kind` cluster is never deleted — it sits idle as a fallback — but it is never operated, compared live, or reconciled alongside EKS. Do **not** register the EKS cluster as an external cluster in the `kind` Argo CD, and do **not** show the two clusters side by side. Each cluster runs **its own** Argo CD reconciling **its own** overlay (seg 21 = Argo CD on `kind` over the base; seg 28 = Argo CD on EKS over the `eks` overlay).
> - **`eksctl create cluster` is kicked off at the top of segment 23, not in the EKS segment.** An EKS control plane takes 15-20 minutes to provision, so you start it in the first two minutes of segment 23 and let it build in the background during the `kind`-only Sealed Secrets teaching. By segment 24 it is already up — there is no long provisioning wait in segment 24.
> - **Teardown (segment 30) is load-bearing, never a footnote.** A scripted `eksctl delete cluster` plus an explicit post-delete check for orphaned EBS volumes and load balancers. A cluster you forget about is a bill you did not budget for.
> - **Overlays are segment 27, over the segment-14 base.** The `kind` and `eks` overlays **patch** the base; they do not rewrite it. The segment-14 base is not edited when the overlays are added.
> - **Per-cluster Sealed Secrets key.** A `SealedSecret` is encrypted against one cluster's controller key. Seg 23 seals the `kind` copy; seg 28 seals the EKS copy. This is a property of how Sealed Secrets works, not a cross-cluster problem to engineer around. Any plaintext shown before sealing is an obviously-fake demo value (`demo-not-a-real-password`).
> - **Built-in and platform observability only (seg 29).** `kubectl top`, events, `kubectl rollout status` (built-in) and EKS CloudWatch Container Insights (platform). No in-cluster Prometheus/Grafana/Loki/LGTM install — why the workshop stops short of one is a one-sentence talking point, not a demo.
>
> **Explicitly out of scope for the whole workshop (decline on stage without improvising):**
> - **No Helm.** Kustomize is the only manifest-management tool taught. (`metrics-server`, the Sealed Secrets controller, the EBS CSI driver, the AWS Load Balancer Controller, and Argo CD are installed by their documented manifests, not Helm.)
> - **No hand-written StatefulSet** for Postgres. Durability is the CloudNativePG operator (Stable, segment 13); the CNPG `Cluster` is unchanged through Production.
> - **No in-cluster observability stacks** (Prometheus, Grafana, Loki, LGTM). Only built-in signals and EKS CloudWatch Container Insights.
> - **No service mesh** (Istio, Linkerd, Cilium service mesh).
> - **No authoring a custom operator** — the workshop consumes Argo CD and the Sealed Secrets controller; it never writes a controller.
> - **No multi-cluster operation** — exactly one cluster at a time, as above.

---

## Segment 17 — 9:45 — Autoscaling with HPA

**Stage:** Production.
**Duration:** 30 minutes.

### Goal

Make the app scale itself. You install `metrics-server` so the cluster can read CPU usage, write a HorizontalPodAutoscaler that targets the app's Deployment on a CPU goal, then drive load at the data endpoint and watch the replica count climb and settle on its own. This is the control loop from Foundations applied to capacity: you declare a CPU target, and the HPA never stops nudging the replica count toward it. It opens Production because everything else this stage adds assumes an app that can grow and shrink without a human typing `kubectl scale`.

### Talking points

- **The HPA is cruise control for replicas.** You set a desired CPU utilization — say 50% — and the controller reads the actual CPU across the Pods and adjusts the replica count to close the gap. Same loop as the Deployment self-healing, one level up: the Deployment keeps N Pods alive, the HPA decides what N should be.
- **The HPA needs a metrics source, and `kind` ships none.** It reads Pod CPU from the metrics API, which `metrics-server` provides. Install it **first thing** and let it warm up while you explain the spec — until it has scraped a cycle, the HPA shows `<unknown>` for the CPU column, which looks broken but is just the metric not being populated yet.
- **Requests are what the percentage is measured against.** The HPA's "50% CPU" means 50% of the Pod's CPU **request** (set back in Stable, segment 9), not 50% of a core. No request, no meaningful target — this is why the resource requests from Stable are a prerequisite for autoscaling.
- **Scale up is eager, scale down is cautious.** The HPA adds replicas quickly under load but removes them slowly after load drops, to avoid flapping. When the load generator stops, the count does not snap back instantly — that delay is deliberate, not a bug.

### Live build

Install `metrics-server` first, before anything else, so it is scraping by the time the HPA needs it. On `kind` the kubelet serving certs are self-signed, so the documented `kind` adjustment is to allow insecure kubelet TLS for the metrics-server Deployment:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl patch deployment metrics-server -n kube-system --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
```

```text
serviceaccount/metrics-server created
deployment.apps/metrics-server created
...
deployment.apps/metrics-server patched
```

Name the tradeoff out loud as you apply it: `--kubelet-insecure-tls` tells metrics-server to skip verifying the kubelet's serving certificate, which is a real man-in-the-middle surface — it is acceptable here only because this is a local/test `kind` cluster with self-signed kubelet certs, and it must never be carried to a production cluster (the EKS path in segment 29 uses the platform metrics API and does not re-apply this flag). Every insecure concession in this workshop gets named when it is made.

While it warms up, walk the HPA spec out loud. The target is the app's Deployment in the app namespace; the goal is average CPU utilization against the request:

```bash
kubectl autoscale deployment sample-app -n app \
  --cpu-percent=50 --min=1 --max=5
```

```text
horizontalpodautoscaler.autoscaling/sample-app autoscaled
```

Now check the HPA. On the first read the CPU column may still show `<unknown>` — that is `metrics-server` not having scraped yet, not a misconfigured HPA. Re-run after a few seconds and it populates:

```bash
kubectl get hpa -n app
```

```text
NAME         REFERENCE               TARGETS         MINPODS   MAXPODS   REPLICAS   AGE
sample-app   Deployment/sample-app   cpu: 2%/50%     1         5         1          30s
```

With a real metric showing, drive load at the data endpoint to push CPU up. Run a small load generator against the app's in-cluster Service from a throwaway Pod so the traffic is realistic:

```bash
kubectl run -n app load --rm -it --image=busybox --restart=Never -- \
  sh -c "while true; do wget -q -O- http://sample-app:8080/<the data endpoint>; done"
```

In a second pane, watch the HPA and the replica count respond. CPU climbs past the 50% target and the HPA raises the desired replicas:

```bash
kubectl get hpa -n app --watch
```

```text
NAME         REFERENCE               TARGETS          MINPODS   MAXPODS   REPLICAS   AGE
sample-app   Deployment/sample-app   cpu: 2%/50%      1         5         1          2m
sample-app   Deployment/sample-app   cpu: 180%/50%    1         5         1          2m
sample-app   Deployment/sample-app   cpu: 180%/50%    1         5         4          2m
sample-app   Deployment/sample-app   cpu: 61%/50%     1         5         4          3m
```

Stop the load generator (Ctrl-C the load Pod, which deletes it via `--rm`). CPU falls, and after the stabilization window the HPA scales back down — slowly, on purpose. Point out the lag rather than waiting on it:

```bash
kubectl get hpa -n app
```

```text
NAME         REFERENCE               TARGETS         MINPODS   MAXPODS   REPLICAS   AGE
sample-app   Deployment/sample-app   cpu: 3%/50%     1         5         2          6m
```

The app grew under load and is shrinking back without a single manual `scale`. That is the whole lesson.

### Watch for

- **HPA stuck at `<unknown>` for the CPU target.** This is the symptom students hit first, and the common case is benign: the `metrics-server` Pod is `Running` but has not completed a scrape cycle yet — wait a cycle and re-run, and it populates. The underlying cause to rule out only if it persists is the kubelet serving cert: on `kind` the kubelet certs are self-signed, so if the `--kubelet-insecure-tls` patch was skipped the Pod sits in `CrashLoopBackOff` failing cert verification and never scrapes. `kubectl get pods -n kube-system | grep metrics-server` and `kubectl logs` tell you which: a `Running` Pod just needs time, a crashing one needs the patch re-applied. Keep naming the tradeoff when you apply it — `--kubelet-insecure-tls` skips verifying the kubelet's serving cert (a real man-in-the-middle surface) and is acceptable only on a local `kind` cluster, never in production.
- **HPA reports `<unknown>` even with metrics-server healthy** — the Deployment has no CPU **request**. The percentage is computed against the request; without one there is nothing to take a percentage of. The request was set in Stable segment 9; if a student's manifest lacks it, point them at the `stable` branch.
- **Replicas do not climb under load** — the load generator may be hitting a cached endpoint or the health endpoint instead of the CPU-bound data endpoint. Confirm it is hitting the data endpoint; `/healthz` is intentionally cheap and will not move CPU.

### Anticipated questions

**Q:** Can the HPA scale on memory or on a custom metric, not just CPU?
**A:** Yes — memory works out of the box the same way, and custom or external metrics (requests per second, queue depth) work through the metrics adapter API. We use CPU because it is the one signal `metrics-server` gives us with zero extra wiring, and the point here is the autoscaling loop, not the metric.

### Transition

The app now sizes itself to load. But scaling assumes that *deploying a new version* is safe in the first place — and right now a bad image would roll straight out to every replica. Segment 18 makes the rollout itself safe: a controlled rolling update that stalls on a broken image instead of taking the app down, and a one-command rollback.

---

## Segment 18 — 10:15 — Safe Rollouts & Rollbacks

**Stage:** Production.
**Duration:** 30 minutes.

### Goal

Make deploying a new version safe. You walk the Deployment's rolling-update strategy — `maxSurge`, `maxUnavailable`, and how the readiness probe gates each new Pod — then deliberately roll out a broken image and watch the rollout **stall** instead of taking the app down. You recover with `kubectl rollout undo`. The lesson is that a healthy rollout config plus the probes from Stable turns a bad deploy from an outage into a non-event.

### Talking points

- **A rolling update replaces Pods a few at a time, not all at once.** `maxSurge` is how many extra Pods it may create above the desired count during the roll; `maxUnavailable` is how many of the old Pods it may take down before replacements are ready. Together they keep capacity up while the version changes underneath.
- **The readiness probe is the safety interlock.** A new Pod only counts toward the rollout's progress once it passes readiness. If the new version never becomes ready — a broken image, a bad config — the rollout cannot proceed and **stalls** with the old Pods still serving. The probe you added in Stable is what makes this safe.
- **A stalled rollout is a success, not a failure.** It means the guardrail worked: the bad version is held back, the app stays up on the old version, and you get to decide what to do. Say this out loud before you break the image, so the stall reads as the win it is.
- **`kubectl rollout undo` is the escape hatch.** Kubernetes keeps the previous ReplicaSet, so rolling back is reverting to a revision that is already known-good — not a fresh deploy of old code. It is fast because the old Pods may still be running.

### Live build

Show the current rollout strategy on the Deployment. The defaults are a sensible 25%/25%, surfaced here so the numbers are concrete. Use `kubectl describe`, not `-o jsonpath='{.spec.strategy}'`: the controller applies these defaults at runtime and does **not** persist them into `.spec.strategy` unless they were set explicitly, so the jsonpath would render blank on a Deployment that never set them — `describe` shows the resolved values either way:

```bash
kubectl describe deployment sample-app -n app | grep -A2 StrategyType
```

```text
StrategyType:           RollingUpdate
MinReadySeconds:        0
RollingUpdateStrategy:  25% max unavailable, 25% max surge
```

Roll out a good change first so the class sees a healthy rollout complete — bump to a known-good tag and watch `rollout status` march to done. The base already runs `:v1`, so `<a-known-good-tag>` must be a **distinct** known-good tag, different from the `:v1` the Deployment is already on — rolling to the tag it already runs is a no-op and the class sees nothing change:

```bash
kubectl set image deployment/sample-app -n app \
  sample-app=<registry>/<image>:<a-known-good-tag>
kubectl rollout status deployment/sample-app -n app
```

```text
deployment.apps/sample-app image updated
Waiting for deployment "sample-app" rollout to finish: 1 out of 2 new replicas have been updated...
deployment "sample-app" successfully rolled out
```

Now break it on purpose. Roll out a tag that does not exist (or an image that fails its readiness probe). The new Pod can never become ready, so the rollout stalls — and the old Pods keep serving:

```bash
kubectl set image deployment/sample-app -n app \
  sample-app=<registry>/<image>:does-not-exist
kubectl rollout status deployment/sample-app -n app --timeout=60s
```

```text
deployment.apps/sample-app image updated
Waiting for deployment "sample-app" rollout to finish: 1 old replicas are pending termination...
error: timed out waiting for the condition
```

Confirm the stall visually: the new Pod is wedged on the failed pull while the old Pod stays `Running` and serving traffic. The app is **not** down. A failed pull shows briefly as `ErrImagePull` on the first attempt and then settles into `ImagePullBackOff` as kubelet backs off — same wedged-pull signal, so you may catch either status depending on timing:

```bash
kubectl get pods -n app
```

```text
NAME                          READY   STATUS             RESTARTS   AGE
sample-app-7d9c4b5f8-2xq4r    1/1     Running            0          5m
sample-app-6c4f9b2a1-pk8wd    0/1     ErrImagePull       0          40s
```

Recover with one command. `rollout undo` reverts to the last known-good revision, which is already on disk:

```bash
kubectl rollout undo deployment/sample-app -n app
kubectl rollout status deployment/sample-app -n app
```

```text
deployment.apps/sample-app rolled back
deployment "sample-app" successfully rolled out
```

The broken Pod is gone, the desired count is healthy, and the app never dropped a request. That is the safety the rollout strategy plus the readiness probe buys you.

### Watch for

- **The "broken" rollout completes successfully** — the bad tag actually pulled (it exists), or the image starts and passes readiness anyway. Use a tag you are certain does not exist, or an image whose `/healthz` returns non-200, so readiness genuinely fails and the rollout stalls.
- **`rollout status` returns immediately as done** before you can show the stall — add `--timeout=60s` so it gives up cleanly with a message instead of hanging the stage. The timeout is how you demonstrate the stall without waiting forever.
- **`rollout undo` rolls back to the wrong revision** — if you have rolled several times, `kubectl rollout history deployment/sample-app -n app` shows the revisions and `--to-revision=N` targets a specific one. Keep the demo to one good roll then one bad roll so undo is unambiguous.

### Transition

A bad version can no longer take the app down, and a rollback is one command. But there is another way the app loses Pods that has nothing to do with deploys — the cluster itself moving workloads when a node is drained for maintenance. Segment 19 makes the app survive that, with a PodDisruptionBudget and a node drain.

---

## Segment 19 — 10:45 — PodDisruptionBudgets & Node Drains

**Stage:** Production.
**Duration:** 20 minutes.

### Goal

Keep the app serving when a node goes away **on purpose**. You distinguish voluntary disruption (an admin draining a node for maintenance) from involuntary (a node crashing), write a PodDisruptionBudget that says "never let fewer than N app Pods be available," and then run `kubectl drain` on a worker — watching the PDB plus multiple replicas keep the app up throughout. The lesson is that node maintenance is routine, and a PDB is how you make routine maintenance invisible to users.

### Talking points

- **Voluntary vs. involuntary disruption.** A node crashing or losing power is *involuntary* — nothing can stop it, you just heal afterward. Draining a node for an upgrade is *voluntary* — it is initiated by an admin, and that is exactly the disruption a PodDisruptionBudget can hold back. The PDB protects only against the voluntary kind.
- **A PDB is a floor, not a ceiling.** `minAvailable: 1` (or a percentage) tells the eviction API: you may evict app Pods for a drain, but never take the available count below this floor. The drain then waits, evicting one Pod only after its replacement is ready elsewhere.
- **This only works because the app has more than one replica.** With a single replica and `minAvailable: 1`, the drain cannot make progress without violating the budget — it blocks. The HPA from segment 17 and the rolling updates from segment 18 already assume multiple replicas; the PDB is the third reason the app is never a single Pod in Production.
- **`kubectl drain` is how you close down a kitchen station for cleaning.** It cordons the node (no new orders sent to that station) and moves the in-flight work to the other stations politely, honoring PDBs. It is how you take a node out of rotation to patch or replace it without an outage.

### Live build

Make sure the app has room to lose a Pod — scale to a floor of replicas the drain can work against (the HPA's `--min` is 1, so set a working floor for the demo):

```bash
kubectl scale deployment sample-app -n app --replicas=3
```

```text
deployment.apps/sample-app scaled
```

Create the PodDisruptionBudget: at least 2 app Pods must stay available through any voluntary disruption:

```bash
kubectl create poddisruptionbudget sample-app -n app \
  --selector=app=sample-app --min-available=2
```

```text
poddisruptionbudget.policy/sample-app created
```

Confirm the PDB sees the Pods. `ALLOWED DISRUPTIONS` is how many Pods may be evicted right now without breaching the floor:

```bash
kubectl get pdb -n app
```

```text
NAME         MIN AVAILABLE   MAX UNAVAILABLE   ALLOWED DISRUPTIONS   AGE
sample-app   2               N/A               1                     10s
```

First find which worker is running the database, because you want to drain *around* it. CloudNativePG runs a single Postgres instance here, and it auto-creates a `postgres-primary` PodDisruptionBudget with `minAvailable: 1` / `allowed-disruptions: 0` — its one Pod can never be voluntarily evicted, so a drain of whatever node it sits on will block on that PDB and time out. (In production you would scale CNPG to 2 instances so any worker is drainable; for this single-instance demo you simply pick the other node.) Check where `postgres-1` landed:

```bash
kubectl get pod postgres-1 -n app -o wide
```

```text
NAME         READY   STATUS    RESTARTS   AGE   IP           NODE          NOMINATED NODE   READINESS GATES
postgres-1   1/1     Running   0          12m   10.244.1.7   kind-worker   <none>           <none>
```

Drain the worker that is **not** running `postgres-1` — here `postgres-1` is on `kind-worker`, so drain `kind-worker2`. The drain cordons the node and evicts Pods, but the app PDB makes it evict the app Pod only after a replacement is ready — so the available count never drops below 2:

```bash
kubectl drain kind-worker2 --ignore-daemonsets --delete-emptydir-data
```

```text
node/kind-worker2 cordoned
evicting pod app/sample-app-7d9c4b5f8-2xq4r
evicting pod kube-system/...
pod/sample-app-7d9c4b5f8-2xq4r evicted
node/kind-worker2 drained
```

Throughout the drain, hit the app — it keeps answering, because the app PDB held the floor while Pods moved to the other worker. There is no outage; a single sub-second blip is possible if the `nginx-gateway` controller Pod happened to be on the drained node and gets evicted, but traffic recovers instantly:

```bash
curl -H "Host: sample-app.local" http://localhost:30080/healthz
```

```text
{"status":"ok"}
```

Uncordon the node when you are done so the cluster goes back to normal for the rest of the morning:

```bash
kubectl uncordon kind-worker2
```

```text
node/kind-worker2 uncordoned
```

The node went out for maintenance and came back with no outage — at worst a user saw a single sub-second blip if the gateway controller Pod rode along on the drained node, and it recovered instantly.

### Watch for

- **The drain hangs on `postgres-1` and times out** — this is the case the `kubectl get pod postgres-1 -o wide` step above exists to avoid. CloudNativePG's single instance has a `postgres-primary` PDB with `allowed-disruptions: 0`, so draining the node it sits on blocks forever with `Cannot evict pod as it would violate the pod's disruption budget`. If you see this, you drained the wrong worker — uncordon it and drain the other one. (Scaling CNPG to 2 instances is the production fix that makes any node drainable.)
- **The drain hangs on the app Pods** — the app PDB cannot be satisfied because there are not enough replicas to keep the floor while evicting. With `minAvailable: 2` you need at least 3 replicas for the drain to make progress. Confirm the replica count; this is the "single replica blocks the drain" lesson made literal.
- **`kubectl drain` errors on DaemonSet Pods** — pass `--ignore-daemonsets` (as above). DaemonSet Pods are managed per-node and are expected to stay; the flag tells drain to skip them rather than fail.
- **`emptyDir` data warning** — `--delete-emptydir-data` acknowledges that any `emptyDir` scratch space on evicted Pods is discarded. On `kind` with this app that is safe; name it so students know the flag is a deliberate acknowledgement, not a workaround.

### Transition

The app now survives deploys and node maintenance. What it has *not* earned yet is the right to do only its own job — it is still running under the namespace's default ServiceAccount, which can do far more than the app needs. Segment 20 tightens that down with a dedicated ServiceAccount and a least-privilege Role.

---

## Segment 20 — 11:05 — RBAC & Least Privilege

**Stage:** Production.
**Duration:** 25 minutes.

### Goal

Give the workload exactly the permissions it needs and nothing more. The app has been running under the namespace's default ServiceAccount, which is broader than its job. You create a dedicated ServiceAccount, a Role scoped to precisely what the app needs, a RoleBinding tying them together, and assign the ServiceAccount to the Deployment. The framing is least privilege: a compromised workload can only do what its identity allows, so you make that identity small.

### Talking points

- **Every Pod runs as a ServiceAccount whether you choose one or not.** Skip it and the Pod gets the namespace's `default` ServiceAccount, whose token is mounted into the container. The default is not zero-privilege — it is "whatever the namespace's default happens to allow," which is exactly the ambiguity least privilege removes.
- **Role + RoleBinding is the whole RBAC model, namespaced.** A **Role** is a list of allowed verbs on resources (`get`, `list` on `configmaps`, say). A **RoleBinding** grants that Role to a subject — here, the app's ServiceAccount. A `ClusterRole`/`ClusterRoleBinding` would do the same cluster-wide; the app needs neither, which is the point.
- **Scope to what the app actually does, not what might be handy.** This app talks to Postgres over the network and serves HTTP — it does not need to read Secrets or list Pods through the API at all. The narrowest correct Role here may grant almost nothing; resist adding verbs "just in case." Least privilege means the Role grows only when a real need appears.
- **A dedicated ServiceAccount is also an audit handle.** Once the app has its own identity, every API call it makes is attributable to it, and you can reason about — and revoke — its access independently of everything else in the namespace.
- **Turn off the token mount when the app never calls the API.** By default the ServiceAccount's bearer token is auto-mounted into the container at `/var/run/secrets/kubernetes.io/serviceaccount`, so a compromised Pod carries a usable credential even when its Role grants almost nothing. This app talks to Postgres and serves HTTP — it never calls the Kubernetes API — so set `automountServiceAccountToken: false` and the token never lands in the container at all. Least privilege is not just a small Role; it is also not handing out a credential the app does not use.

### Live build

Create a dedicated ServiceAccount for the app in its namespace:

```bash
kubectl create serviceaccount sample-app -n app
```

```text
serviceaccount/sample-app created
```

Turn off the auto-mounted token, because this app never calls the Kubernetes API — so even a compromised Pod carries no bearer credential:

```bash
kubectl patch serviceaccount sample-app -n app \
  -p '{"automountServiceAccountToken": false}'
```

```text
serviceaccount/sample-app patched
```

Create a tightly-scoped Role. This app only needs to read its own ConfigMap for non-secret config; that is the entire grant — no Secrets, no Pods, no write verbs:

```bash
kubectl create role sample-app -n app \
  --verb=get,list --resource=configmaps
```

```text
role.rbac.authorization.k8s.io/sample-app created
```

Bind the Role to the ServiceAccount with a RoleBinding:

```bash
kubectl create rolebinding sample-app -n app \
  --role=sample-app --serviceaccount=app:sample-app
```

```text
rolebinding.rbac.authorization.k8s.io/sample-app created
```

Assign the ServiceAccount to the Deployment so its Pods run under that identity instead of `default`. Setting it rolls the Pods:

```bash
kubectl set serviceaccount deployment/sample-app -n app sample-app
```

```text
deployment.apps/sample-app serviceaccount updated
```

Prove the scope with `kubectl auth can-i` impersonating the ServiceAccount. It can read ConfigMaps (granted) but cannot read Secrets (deliberately not granted):

```bash
kubectl auth can-i get configmaps -n app \
  --as=system:serviceaccount:app:sample-app
```

```text
yes
```

```bash
kubectl auth can-i get secrets -n app \
  --as=system:serviceaccount:app:sample-app
```

```text
no
```

The app runs under an identity that can do its job and nothing else. If this Pod were ever compromised, its Kubernetes blast radius is exactly that Role — read its own ConfigMap, nothing more — and because the token is not even mounted, the attacker has no API credential to use in the first place. The remaining exposure is whatever the app itself can reach (its Postgres connection), not the cluster API.

### Watch for

- **App Pods crash after the ServiceAccount change** — the app may have been relying on a permission the default ServiceAccount had that the new Role does not grant. Check `kubectl logs` for an RBAC `forbidden` error; the fix is to add the *specific* missing verb to the Role, not to widen it back to the default. That investigation is itself the least-privilege lesson.
- **`auth can-i` says `yes` to something you did not grant** — a broader binding (often a `ClusterRoleBinding` from a previous experiment, or the namespace default) is still in effect. `kubectl get rolebindings,clusterrolebindings -A -o wide | grep sample-app` shows every binding touching the subject.
- **Typo in the `--serviceaccount` argument** — the form is `<namespace>:<name>`; a wrong namespace silently binds nothing useful. Confirm with `kubectl get rolebinding sample-app -n app -o yaml` that the subject matches the ServiceAccount you created.

### Transition

The app is now autoscaled, safely deployable, drain-resilient, and least-privileged — every property a teammate would expect. The last morning segment changes *how* it is deployed: instead of you running `kubectl apply`, git becomes the source of truth and Argo CD keeps the cluster matching it. Segment 21 installs Argo CD on `kind` and points it at the Kustomize base.

---

## Segment 21 — 11:30 — GitOps with Argo CD

**Stage:** Production.
**Duration:** 30 minutes.

### Goal

Change the deploy mechanism itself. Instead of you running `kubectl apply`, git becomes the source of truth and a reconciler — Argo CD — continuously keeps the cluster matching it. You install Argo CD on `kind`, tour its UI, point an `Application` at the repository's Kustomize base, watch a commit sync to the cluster, and then hand-edit a live resource to show Argo CD flag it as **drift**. This is the control loop one final level up: git is the desired state, the cluster is the actual state, and Argo CD is the reconciliation.

### Talking points

- **GitOps is the cruise-control loop with git as the dial.** The desired state lives in git, Argo CD reads it, compares it to the cluster, and drives the cluster to match — forever. You stop applying changes to the cluster; you commit them, and the reconciler does the applying.
- **Argo CD runs *in* the cluster it manages.** For this workshop that is the whole model: one Argo CD per cluster, reconciling that cluster's own configuration. We are **not** registering external clusters or fanning one Argo CD across many — that is multi-cluster GitOps, a more advanced topic, and explicitly out of scope. When EKS comes this afternoon, it gets its *own* Argo CD (segment 28).
- **An `Application` is the binding between a git path and the cluster.** It says "reconcile what is at this repo path into this namespace." We point it at the Kustomize **base** from Stable's segment 14 — the same `kubectl apply -k` target, now driven by Argo CD instead of by hand.
- **Drift is the loop catching a manual change.** When someone edits a live resource directly, the cluster no longer matches git. Argo CD shows that as `OutOfSync` — and depending on policy can auto-heal it back. The drift demo is the payoff: it shows git is genuinely the source of truth now.

### Live build

Install Argo CD into its own namespace from the upstream manifests:

```bash
kubectl create namespace argocd
kubectl apply --server-side -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/v3.4.3/manifests/install.yaml
```

```text
namespace/argocd created
customresourcedefinition.apiextensions.k8s.io/applications.argoproj.io created
...
deployment.apps/argocd-server created
```

Wait for the server to come up, then port-forward the UI and grab the initial admin password so you can log in and tour it:

```bash
kubectl rollout status deployment/argocd-server -n argocd
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d
```

```text
deployment "argocd-server" successfully rolled out
<representative-generated-admin-password>
```

(The initial admin password is generated by Argo CD and is safe to display as representative output — it is random per install.) Name the guardrail out loud: `argocd-initial-admin-secret` is a **bootstrap** secret, not a credential meant to persist. In any real install the admin changes the password at first login and then deletes this Secret (`kubectl -n argocd delete secret argocd-initial-admin-secret`) — leaving a known-named secret holding the admin password sitting in the cluster is exactly the kind of thing you do not carry past day one. We leave it on the disposable workshop cluster only because it is torn down in segment 30. Port-forward the UI for the tour:

```bash
kubectl port-forward svc/argocd-server -n argocd 8081:443
```

```text
Forwarding from 127.0.0.1:8081 -> 8443
```

Create the `Application` pointing at the repository's Kustomize **base** — the segment-14 target — reconciled into the app namespace. Note `destination.server` is the in-cluster API (`https://kubernetes.default.svc`): Argo CD manages the cluster it lives in, with no external registration:

```bash
kubectl apply -n argocd -f - <<'EOF'
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: sample-app
spec:
  project: default
  source:
    repoURL: https://github.com/ALT-F4-LLC/fem-kubernetes
    targetRevision: main
    path: manifests/day-one/k8s/base
  destination:
    server: https://kubernetes.default.svc
    namespace: app
  syncPolicy:
    automated: { prune: true, selfHeal: true }
EOF
```

```text
application.argoproj.io/sample-app created
```

Watch it sync. The `Application` reconciles the base into the cluster and reports `Synced` / `Healthy`:

```bash
kubectl get application sample-app -n argocd
```

```text
NAME         SYNC STATUS   HEALTH STATUS
sample-app   Synced        Healthy
```

Now the drift demo. Hand-edit a live resource — exactly what GitOps is meant to catch — and watch Argo CD report the cluster no longer matches git:

```bash
kubectl scale deployment sample-app -n app --replicas=4
kubectl get application sample-app -n argocd
```

```text
NAME         SYNC STATUS   HEALTH STATUS
sample-app   OutOfSync     Healthy
```

With `selfHeal: true` in the sync policy, Argo CD drives the replica count back to what git says — the manual change is reverted automatically. Point at the UI showing the diff, then let it heal:

```bash
kubectl get deployment sample-app -n app
```

```text
NAME         READY   UP-TO-DATE   AVAILABLE   AGE
sample-app   2/2     2            2           8m
```

Git won. The cluster is back to what the repository says, and no one applied it by hand.

### Watch for

- **Install errors on the `applicationsets` CRD being too large** — a plain `kubectl apply` (client-side) fails with `metadata.annotations: Too long: may not be more than 262144 bytes`, because the CRD exceeds kubectl's 256KB `last-applied-configuration` annotation limit. The `--server-side` flag above avoids this entirely on a fresh install. You only need to add `--force-conflicts` as a recovery step if a prior **client-side** apply already touched these resources and left field-manager conflicts behind — it is not needed for the clean install shown here.
- **Argo CD install drags and eats the budget** — 30 minutes is enough for the install plus **one** synced `Application` only. If the install is slow, get the one app synced and **move the drift demonstration to segment 28** (per the OUTLINE time-budget note); keep this segment to "installed and one app synced."
- **The `OutOfSync` window flashes by before you can show it** — on this small cluster `selfHeal` drives the manual change back in ~1-2s, so `OutOfSync` can revert faster than a `kubectl get` or a UI poll catches. To actually show the drift, momentarily set `selfHeal: false` on the `Application` (re-enable it after), keep a fast eye on the UI right after the hand-edit, or have a pre-staged screenshot of the `OutOfSync` state ready.
- **`Application` stuck `OutOfSync` and never syncs** — usually `repoURL` / `path` / `targetRevision` does not resolve, or the repo is private and Argo CD has no credentials. Check the app's conditions in the UI or `kubectl describe application sample-app -n argocd`; the error names the unreachable repo or path.
- **Port-forward to the UI fails TLS** — `argocd-server` serves HTTPS on 443; forward to the local port and accept the self-signed cert in the browser, or use `--insecure` on the UI. This is a `kind`-local convenience, not how you would expose Argo CD for real.

### Transition

Argo CD now reconciles everything from git — except one thing was deliberately left out of the repo: the database Secret, because committing a plaintext Secret to a public repo would leak it. After lunch, segment 23 closes that gap with Sealed Secrets — and kicks off the EKS cluster in its first two minutes so the cloud capstone has somewhere to land.

---

## Segment 23 — 12:45 — GitOps Secrets with Sealed Secrets

**Stage:** Production.
**Duration:** 30 minutes.

### Goal

Close the one gap GitOps left open: the database Secret could not be committed to a public repo, because a Kubernetes Secret is only base64-encoded, not encrypted. You install the Sealed Secrets controller on `kind`, use the `kubeseal` CLI to encrypt the Secret into a `SealedSecret` custom resource that is safe to commit, push it to the repo, and watch the controller decrypt it back into a real Secret in the cluster. With that, git is genuinely the complete source of truth — nothing secret is left out. **And before you teach any of this, you start the EKS cluster** so it provisions in the background during this segment.

### Talking points

- **Start with the EKS cluster — say why out loud.** The first thing you do this segment, before Sealed Secrets, is run `eksctl create cluster`. An EKS control plane takes 15-20 minutes to come up, so you kick it off now and let it build in the background while this entirely-`kind` Sealed Secrets segment fills the wait. By segment 24 it will be ready and there is no provisioning wait there.
- **base64 is not encryption — this is why GitOps had a hole.** A Kubernetes Secret is base64-encoded so it can carry binary safely; anyone can decode it instantly. That is why the Secret was kept *out* of git when Argo CD took over in segment 21 — committing it would publish the password to anyone who can read the repo.
- **Sealed Secrets is the operator pattern again, doing one thing: decrypt.** The controller (a second instance of the operator pattern from Stable segment 12) holds a private key in the cluster. `kubeseal` encrypts your Secret with the matching public key into a `SealedSecret` CR. Only that cluster's controller can decrypt it — so the `SealedSecret` is safe in public git, and the controller turns it back into a real Secret in-cluster.
- **The key is per-cluster — remember this for EKS.** A `SealedSecret` is encrypted against *one* cluster's controller key. The copy you seal now works only on `kind`. When EKS comes online, it installs its own controller with its own key and seals its own copy — that is segment 28, and it is a property of how Sealed Secrets works, not a problem to engineer around.

### Live build

**First two minutes, before anything else:** kick off the EKS cluster so it provisions in the background. The cluster config lives in the pre-flight materials; substitute your account and region:

```bash
eksctl create cluster -f eks-cluster.yaml
```

```text
2026-06-03 12:46:01 [ℹ]  eksctl version 0.x.x
2026-06-03 12:46:01 [ℹ]  using region us-west-2
2026-06-03 12:46:02 [ℹ]  building cluster stack "eksctl-fem-workshop-cluster"
2026-06-03 12:46:03 [ℹ]  deploying stack "eksctl-fem-workshop-cluster" ...
```

That now runs unattended for ~15-20 minutes. **Leave it; do not wait on it.** The whole point is that the provisioning overlaps the teaching — here is the choreography to glance at:

```text
seg 23 ────────────────────────────────────────────────► seg 24
│                                                          │
├─ 0:00  eksctl create cluster  (kick off, ~2 min in)     │
│        │                                                 │
│        └─ EKS control plane provisions in background ────┤  ready
│           (15-20 min)                                    │  (no wait)
│                                                          │
└─ teach Sealed Secrets on kind ──────────────────────────┘
   (fills the wait — entirely kind, no EKS needed)
```

Switch back to the `kind` context and teach Sealed Secrets while EKS builds:

```bash
kubectl config use-context kind-kind
```

```text
Switched to context "kind-kind".
```

Install the Sealed Secrets controller on `kind` from the upstream manifest:

```bash
kubectl apply -f \
  https://github.com/bitnami-labs/sealed-secrets/releases/latest/download/controller.yaml
```

```text
...
deployment.apps/sealed-secrets-controller created
service/sealed-secrets-controller created
```

Create the plaintext Secret **locally only** — never applied to the cluster, never committed. Note what `db-extra` is and is not: it is a contrived, illustrative throwaway Secret that exists **only** to demonstrate the sealing workflow — the app never reads it. The credential the app actually consumes is CloudNativePG's auto-generated `postgres-app` Secret from Stable segment 13; `db-extra` is a stand-in so we can seal something without touching the real database wiring. The password is an obviously-fake demo value, and we redirect to a local file we will seal and then delete. This prints nothing on success — the manifest goes to `db-extra-secret.yaml` rather than the cluster:

```bash
kubectl create secret generic db-extra -n app \
  --from-literal=password=demo-not-a-real-password \
  --dry-run=client -o yaml > db-extra-secret.yaml
```

Seal it with `kubeseal`. This encrypts against the `kind` controller's public key and produces a `SealedSecret` CR that is safe to commit. It also prints nothing on success — the encrypted, git-safe resource lands in `sealed-db-extra.yaml`:

```bash
kubeseal --controller-namespace kube-system \
  --format yaml < db-extra-secret.yaml > sealed-db-extra.yaml
```

Show that the sealed output is genuinely encrypted — the password is gone, replaced by ciphertext only this cluster can decrypt:

```bash
grep -A1 "encryptedData" sealed-db-extra.yaml
```

```text
  encryptedData:
    password: AgBvA3f9...Qy2N1zKqencrypted-ciphertext-not-the-password...==
```

Delete the plaintext file so it never lands in git, then apply the `SealedSecret` (in real GitOps you commit it and Argo CD applies it; applying directly here shows the decrypt loop immediately):

```bash
rm db-extra-secret.yaml
kubectl apply -f sealed-db-extra.yaml
```

```text
sealedsecret.bitnami.com/db-extra created
```

Watch the controller decrypt the `SealedSecret` into a real Secret in the cluster — the resource you can commit produced the resource the app consumes:

```bash
kubectl get sealedsecret,secret db-extra -n app
```

```text
NAME                                  AGE
sealedsecret.bitnami.com/db-extra     15s

NAME                 TYPE     DATA   AGE
secret/db-extra      Opaque   1      14s
```

The encrypted `SealedSecret` is safe in public git; the real Secret exists only inside the cluster. GitOps now has no remaining gap.

### Watch for

- **The EKS cluster fails to come up** during the background provision — do not debug `eksctl` on stage. Point the student at the **fallback pre-provisioned cluster** from the pre-flight materials and keep going; segment 24 works the same against either. Losing the stage to a CloudFormation rabbit hole is the one failure that wrecks the afternoon.
- **`kubeseal` cannot reach the controller** (`cannot fetch certificate`) — it needs to talk to the controller to fetch its public key. Confirm the controller Pod is `Running` and the `--controller-namespace` matches where it installed (the upstream manifest defaults to `kube-system`). On a flaky connection, `kubeseal --fetch-cert` once and seal offline against the saved cert.
- **A student applies the *plaintext* Secret by habit** — the whole point is that the plaintext file is local-only and deleted. If it was applied, delete the Secret, re-seal, and reinforce that only the `SealedSecret` is ever committed. Nothing in the repo automatically blocks committing the plaintext manifest — keeping it out of git is the discipline of writing the plaintext locally, deleting it, and only ever `git add`-ing the `SealedSecret`. For belt-and-suspenders, the instructor can add a narrow pre-flight `.gitignore` entry for the specific plaintext filename they use (here `db-extra-secret.yaml`), never a broad `*secret*` glob — that would also ignore the `sealed-db-extra.yaml` manifests this segment *must* commit.

### Anticipated questions

**Q:** If I lose the cluster, can I still decrypt my `SealedSecret`s?
**A:** Only if you backed up the controller's private key. The key lives in the cluster, so a `SealedSecret` is decryptable only by the controller that sealed it — which is exactly why each cluster seals its own copy, and why EKS will seal a fresh one in segment 28. For real use you would back up and restore the controller key; we do not, because each workshop cluster is disposable.

### Transition

The `kind` cluster is now complete — autoscaled, safely deployable, drain-resilient, least-privileged, GitOps-driven, and git-safe on secrets. And while we built all that, the EKS cluster came up in the background. Segment 24 switches to it: a real managed control plane in the cloud, ready to receive the same application.

---

**AFTERNOON — Cloud (EKS).** The morning hardened the app on `kind`; from segment 24 on, the same application is migrated onto a real Amazon EKS cluster. One cluster at a time — `kind` goes idle as a fallback, never operated alongside EKS.

---

## Segment 24 — 1:15 — Going to the Cloud: Your EKS Cluster

**Stage:** Production.
**Duration:** 20 minutes.

### Goal

Meet the EKS cluster that has been provisioning since the top of segment 23 — it is up now, so there is no waiting. You tour what a managed control plane gives you, switch `kubectl` to the new EKS context, confirm the nodes are `Ready`, and name what still has to be done to bring this cloud cluster up to the `kind` cluster's baseline: real storage, real networking, and its own Sealed Secrets controller. From here the afternoon migrates the app onto this one cluster — `kind` goes idle as a fallback and is never operated alongside EKS.

### Talking points

- **EKS runs the control plane so you do not.** The API server, etcd, scheduler, and controller-manager are managed, highly available, and patched by AWS — the head chef from the kitchen analogy, now run for you. You manage worker nodes and your workloads; you never SSH into the control plane.
- **One cluster at a time — we are migrating, not federating.** `kind` is not deleted; it sits idle on the laptop as a fallback. But from here on we operate *only* EKS. We do not register the `kind` cluster against the EKS Argo CD, do not compare the two live, and do not run one Argo CD across both. This is a migration of the same app onto a new cluster, full stop.
- **The context switch is how the one-cluster rule is enforced.** `eksctl` wrote a new `kubectl` context for the EKS cluster. Switching to it is the single action that moves all our operations to the cloud; switching back to `kind-kind` is only ever for the fallback, never for side-by-side work.
- **It costs money by the hour — which is why segment 30 tears it down.** The control plane, the nodes, and (soon) the load balancer and EBS volumes all bill continuously. Name the cost now so the mandatory teardown later reads as discipline, not an afterthought.

### Live build

The cluster came up under segment 23's background provision. Point `kubectl` at the EKS context `eksctl` created (substitute your region and cluster name):

```bash
kubectl config use-context <your-aws-account>@fem-workshop.us-west-2.eksctl.io
```

```text
Switched to context "<your-aws-account>@fem-workshop.us-west-2.eksctl.io".
```

Confirm the cluster is live — the managed nodes should be `Ready`. These are real EC2 instances, not containers on a laptop:

```bash
kubectl get nodes
```

```text
NAME                                          STATUS   ROLES    AGE   VERSION
ip-192-168-12-34.us-west-2.compute.internal    Ready    <none>   3m    v1.3x.x-eks-xxxxx
ip-192-168-56-78.us-west-2.compute.internal    Ready    <none>   3m    v1.3x.x-eks-xxxxx
```

Show where the control plane lives — a managed AWS endpoint, not a local port:

```bash
kubectl cluster-info
```

```text
Kubernetes control plane is running at https://XXXXXXXX.gr7.us-west-2.eks.amazonaws.com
CoreDNS is running at https://XXXXXXXX.gr7.us-west-2.eks.amazonaws.com/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy
```

Name the gaps out loud — what EKS does *not* yet have that `kind` did. There is no local-path provisioner, no NGINX Gateway Fabric or any other Gateway controller, and no Sealed Secrets controller here. Show that the default StorageClass story is different by listing what exists:

```bash
kubectl get storageclass
```

```text
NAME   PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE      AGE
gp2    kubernetes.io/aws-ebs   Delete          WaitForFirstConsumer   4m
```

The cluster is up, but it is bare. The next three segments close the gaps — storage (25), networking (26), and the overlay that carries the cloud-specific values (27) — before GitOps and Sealed Secrets come over in 28.

### Watch for

- **`kubectl get nodes` returns an auth error** (`could not get token` / `you must be logged in`) — the kubeconfig's EKS auth needs valid AWS credentials in the environment. Confirm `aws sts get-caller-identity` succeeds; if the student is on the fallback pre-provisioned cluster, `eksctl utils write-kubeconfig` (or `aws eks update-kubeconfig`) repoints the context.
- **Nodes are `NotReady` minutes after the cluster reports created** — the node group may still be joining or the VPC CNI still settling. Give it a minute and re-run; if it persists past a few minutes on the real cluster, switch the student to the fallback and investigate after the segment.
- **Wrong context — commands hit `kind` instead of EKS** — `kubectl config current-context` is the one-line check before every cloud command this afternoon. A surprising `kind-kind` here is the most common "why isn't my change showing up" cause.

### Transition

The EKS cluster is up but bare — no durable storage yet. The `kind` local-path provisioner does not exist here, so the CloudNativePG `Cluster`'s PVCs have nothing to bind to. Segment 25 enables the EBS CSI driver and a gp3 StorageClass so the unchanged database manifest binds to real cloud volumes.

---

## Segment 25 — 1:35 — Cluster Storage & the EBS CSI Driver

**Stage:** Production.
**Duration:** 30 minutes.

### Goal

Give EKS durable storage the way `kind` had local-path. The `kind` local-path provisioner does not exist in the cloud, so the CloudNativePG `Cluster`'s PersistentVolumeClaims have nothing to bind to. You enable the EBS CSI driver, create a gp3 StorageClass, and then show that the **unchanged** CNPG `Cluster` manifest now binds its PVCs to real EBS volumes. The lesson is the workshop's recurring theme on storage: the manifest is portable, the storage class behind it is environmental.

### Talking points

- **The PVC is the contract; the provisioner is environmental.** A PersistentVolumeClaim is a stable request — "I need 10Gi of durable storage." On `kind` the local-path provisioner satisfied it; on EKS the EBS CSI driver does, carving a real EBS volume. The CNPG `Cluster` manifest that asks for storage does not change at all — only what fulfills the request does. This is the same contract-vs-controller lesson Day 1 previewed.
- **The EBS CSI driver is how Kubernetes talks to AWS block storage.** CSI (Container Storage Interface) is the standard plug-in point for storage; the EBS CSI driver is the AWS implementation. It runs as an add-on and provisions EBS volumes on demand when a PVC asks for them through its StorageClass.
- **gp3 over the default gp2.** EKS ships a `gp2` StorageClass; gp3 is the newer general-purpose volume type with better baseline performance and decoupled IOPS. We create a `gp3` StorageClass and make it the default so new PVCs land on gp3 — a small, real-world "use the better default" choice.
- **`WaitForFirstConsumer` binds the volume where the Pod lands.** The StorageClass uses late binding so the EBS volume is created in the same availability zone as the Pod that will use it — EBS volumes are zonal, and binding early in the wrong zone is a classic cloud-storage footgun.

### Live build

Enable the EBS CSI driver as a managed EKS add-on (substitute your cluster name and region). `eksctl` wires the IAM permissions the driver needs:

```bash
eksctl create addon --name aws-ebs-csi-driver \
  --cluster fem-workshop --region us-west-2 --force
```

```text
2026-06-03 13:36:10 [ℹ]  creating addon
2026-06-03 13:37:55 [ℹ]  addon "aws-ebs-csi-driver" active
```

Confirm the driver's controller and node Pods are running:

```bash
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-ebs-csi-driver
```

```text
NAME                                  READY   STATUS    RESTARTS   AGE
ebs-csi-controller-7c8f9d6b4-2xq4r    6/6     Running   0          60s
ebs-csi-node-mn2kq                    3/3     Running   0          60s
ebs-csi-node-pk8wd                    3/3     Running   0          60s
```

Create a gp3 StorageClass with late binding and make it the default:

```bash
kubectl apply -f - <<'EOF'
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
volumeBindingMode: WaitForFirstConsumer
parameters:
  type: gp3
EOF
```

```text
storageclass.storage.k8s.io/gp3 created
```

Confirm gp3 is now the default StorageClass:

```bash
kubectl get storageclass
```

```text
NAME            PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE      AGE
gp2             kubernetes.io/aws-ebs   Delete          WaitForFirstConsumer   1h
gp3 (default)   ebs.csi.aws.com         Delete          WaitForFirstConsumer   20s
```

Now apply the **unchanged** CNPG `Cluster` manifest from Stable — the same database definition, no edits — and watch its PVC bind to a real EBS volume through gp3. (The CloudNativePG operator install precedes this on EKS just as it did on `kind`; install it first if not already present.) Show the PVC binding:

```bash
kubectl get pvc -n app
```

```text
NAME         STATUS   VOLUME       CAPACITY   ACCESS MODES   STORAGECLASS   AGE
postgres-1   Bound    pvc-a1b2c3   10Gi       RWO            gp3            45s
```

The same Postgres manifest that ran on local-path now runs on durable EBS — proof in the AWS console, where a real gp3 volume now exists:

```bash
aws ec2 describe-volumes --region us-west-2 \
  --filters Name=tag:kubernetes.io/created-for/pvc/name,Values=postgres-1 \
  --query 'Volumes[].{ID:VolumeId,Type:VolumeType,Size:Size}'
```

```text
[
  { "ID": "vol-0abc123def456", "Type": "gp3", "Size": 10 }
]
```

The manifest was portable; only the storage class behind it changed. Note the volume ID — segment 30's teardown check confirms volumes like this one do not get orphaned.

### Watch for

- **PVC stuck `Pending`** — most often the EBS CSI driver is not healthy or its IAM permissions are missing. `kubectl describe pvc -n app` shows the provisioning event; if it names a permissions error, the add-on's IAM role did not attach — re-run the `eksctl create addon` with the IAM service-account wiring.
- **Volume created in the wrong AZ / Pod cannot schedule** — happens when the StorageClass binds early (`Immediate`) instead of `WaitForFirstConsumer`. Confirm the StorageClass uses late binding as written above; EBS volumes are zonal and must be created where the Pod lands.
- **Two default StorageClasses** — if `gp2` is also marked default, scheduling is ambiguous. `kubectl get storageclass` shows which carry `(default)`; patch `gp2` to remove its default annotation so only `gp3` is default.

### Transition

The database now has durable cloud storage. The other thing `kind` had that EKS does not is a way into the cluster from outside — `kind` ran NGINX Gateway Fabric, and EKS has no Gateway controller yet. Segment 26 installs the AWS Load Balancer Controller so the same `Gateway` and `HTTPRoute` provision a real ALB.

---

## Segment 26 — 2:05 — Cloud Networking & the AWS Load Balancer Controller

**Stage:** Production.
**Duration:** 30 minutes.

### Goal

Give EKS a front door the cloud way. On `kind` the `Gateway` and `HTTPRoute` were fulfilled by NGINX Gateway Fabric; on EKS you install the AWS Load Balancer Controller, and the **same** `Gateway` and `HTTPRoute` now provision a real Application Load Balancer instead. This is the direct payoff of the "the route is a contract, the controller is environment-specific" framing from Day 1: the `Gateway` and `HTTPRoute` YAML is unchanged, but a different controller fulfills it with cloud-native infrastructure — selected by a different `GatewayClass`.

### Talking points

- **The `Gateway` and `HTTPRoute` are the stable contract; the controller is environmental — exactly like storage.** The same `Gateway` (a listener) and `HTTPRoute` (host and path routing to the app's Service) you wrote in Stable are what we use here. On `kind`, NGINX Gateway Fabric turned them into an in-cluster proxy; on EKS, the AWS Load Balancer Controller turns them into a real ALB. Two controllers on purpose, one contract — the same lesson the EBS CSI driver taught for storage.
- **The AWS Load Balancer Controller provisions real AWS load balancers from Kubernetes resources.** It watches `Gateway` and `HTTPRoute` (and `Service` type `LoadBalancer`) and creates an ALB (or NLB), target groups, and listeners in your AWS account to match. It is the bridge between the Kubernetes networking model and AWS's.
- **A `GatewayClass` selects which controller handles a `Gateway`.** With two possible controllers in the world, the `Gateway` names its class through `gatewayClassName` so the right controller picks it up — the same role `IngressClass` played for the old `Ingress`, but now the controller is named explicitly in the YAML rather than hidden behind a class string. On EKS that class points at the ALB controller (`controllerName: gateway.k8s.aws/alb`); the overlay in segment 27 is where that environment-specific class gets set without touching the base.
- **The ALB lives in your AWS account and bills by the hour** — and, like EBS volumes, can be orphaned if the `Gateway` is deleted incorrectly. This is the second resource segment 30's teardown check looks for.

### Live build

The controller needs IAM permissions to manage load balancers. Associate the cluster's OIDC provider and create the IAM service account `eksctl` manages for it:

```bash
eksctl utils associate-iam-oidc-provider --cluster fem-workshop \
  --region us-west-2 --approve
eksctl create iamserviceaccount --cluster fem-workshop --region us-west-2 \
  --namespace kube-system --name aws-load-balancer-controller \
  --attach-policy-arn arn:aws:iam::<your-aws-account>:policy/AWSLoadBalancerControllerIAMPolicy \
  --approve
```

```text
2026-06-03 14:06:20 [ℹ]  created IAM Open ID Connect provider for cluster "fem-workshop"
2026-06-03 14:06:55 [ℹ]  created serviceaccount "kube-system/aws-load-balancer-controller"
```

The v3 Gateway API path has two prerequisites the old v2 Ingress path did not. The controller's manifest webhooks are TLS-served, so it depends on cert-manager; and the Gateway API → ALB feature ships its own CRDs that must be present before the controller starts. Both install via `kubectl apply` — no Helm. Install cert-manager first, then the LBC Gateway API CRDs:

```bash
kubectl apply --validate=false -f \
  https://github.com/cert-manager/cert-manager/releases/download/vX.Y.Z/cert-manager.yaml
kubectl wait --namespace cert-manager \
  --for=condition=Available deployment --all --timeout=120s
kubectl apply -f \
  https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/vX.Y.Z/config/crd/gateway/gateway-crds.yaml
```

```text
namespace/cert-manager created
deployment.apps/cert-manager created
deployment.apps/cert-manager-webhook created
...
customresourcedefinition.apiextensions.k8s.io/loadbalancerconfigurations.gateway.k8s.aws created
customresourcedefinition.apiextensions.k8s.io/targetgroupconfigurations.gateway.k8s.aws created
...
```

Now install the controller from its upstream manifest, pointed at the cluster name:

```bash
kubectl apply -f \
  https://github.com/kubernetes-sigs/aws-load-balancer-controller/releases/latest/download/v3_X_Y_full.yaml
kubectl rollout status deployment/aws-load-balancer-controller -n kube-system
```

```text
...
deployment.apps/aws-load-balancer-controller created
deployment "aws-load-balancer-controller" successfully rolled out
```

One caution on that URL: `v3_X_Y_full.yaml` is an **illustrative placeholder**, not a real filename — unlike the `latest`/`stable` URLs elsewhere in this guide (which AWS and the projects keep resolving), this one does **not** resolve and a literal copy-paste will 404. Apply the specific version you pinned in the pre-flight checklist, substituting the pinned version using underscores throughout the filename — e.g. `v3_3_0_full.yaml`, not `v3_3.0_full.yaml` (the dotted form also 404s). Pin **v3.0.0 or later** — that is where the AWS Load Balancer Controller declared Gateway API → ALB GA. The cert-manager release and the Gateway-CRD ref above are pinned in pre-flight the same way.

Before the `Gateway` can point at the ALB controller, that controller needs a `GatewayClass`. Unlike the NGF NodePort manifest on `kind` — which installed its own `nginx` `GatewayClass` for you — the ALB controller leaves the class for you to create, because the ALB's behaviour is configured *through* it. This is the load-bearing shape change from the old `Ingress`: with the old EKS `Ingress` the ALB knobs would have been `alb.ingress.kubernetes.io/*` annotations smeared on the resource; under the v3 Gateway API they are **type-safe CRDs** — a `LoadBalancerConfiguration` (the scheme) and a `TargetGroupConfiguration` (the target type) — that the `GatewayClass` references by `parametersRef`. The ALB config is no longer two opaque annotation strings; it is a real object the API server validates. Frame it as the upgrade it is.

Create the `LoadBalancerConfiguration` (internet-facing scheme) and `TargetGroupConfiguration` (`target-type: ip`), then the `GatewayClass` that points the ALB controller at them:

```bash
kubectl apply -f - <<'EOF'
apiVersion: gateway.k8s.aws/v1beta1
kind: LoadBalancerConfiguration
metadata:
  name: alb-internet-facing
  namespace: app
spec:
  scheme: internet-facing
---
apiVersion: gateway.k8s.aws/v1beta1
kind: TargetGroupConfiguration
metadata:
  name: alb-target-ip
  namespace: app
spec:
  targetReference:
    name: sample-app
  defaultConfiguration:
    targetType: ip
---
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: alb
spec:
  controllerName: gateway.k8s.aws/alb
  parametersRef:
    group: gateway.k8s.aws
    kind: LoadBalancerConfiguration
    name: alb-internet-facing
    namespace: app
EOF
```

```text
loadbalancerconfiguration.gateway.k8s.aws/alb-internet-facing created
targetgroupconfiguration.gateway.k8s.aws/alb-target-ip created
gatewayclass.gateway.networking.k8s.io/alb created
```

Now apply the **same** `Gateway` and `HTTPRoute` contract from Stable, changing only the `gatewayClassName` so this controller fulfills it. One deliberate difference from the `kind` route in Stable segment 11: that `HTTPRoute` carried a `sample-app.local` hostname, and this EKS route drops it and routes **path-only** through the ALB. That is intentional — the ALB fronts the app on its own public DNS name, so this afternoon's `curl` hits the raw ALB DNS name with **no** `-H "Host: ..."` header, unlike the morning's `curl -H "Host: sample-app.local"`. The `gatewayClassName` and the dropped hostname are the only EKS-specific lines — everything the ALB needs beyond that lives in the CRDs the `GatewayClass` already points at, not on the route:

```bash
kubectl apply -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: sample-app
  namespace: app
spec:
  gatewayClassName: alb
  listeners:
    - name: http
      protocol: HTTP
      port: 80
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: sample-app
  namespace: app
spec:
  parentRefs:
    - name: sample-app
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: sample-app
          port: 8080
EOF
```

```text
gateway.gateway.networking.k8s.io/sample-app created
httproute.gateway.networking.k8s.io/sample-app created
```

Watch the controller provision a real ALB and populate the `Gateway` address with the ALB's DNS name — this takes a minute or two as AWS creates the load balancer. The `Gateway` reports `PROGRAMMED` once the ALB is wired up, exactly as it did on `kind`:

```bash
kubectl get gateway sample-app -n app
```

```text
NAME         CLASS   ADDRESS                                                       PROGRAMMED   AGE
sample-app   alb     k8s-sampleapp-xxxx-1234567890.us-west-2.elb.amazonaws.com      True         90s
```

Hit the app through the ALB's public DNS name — traffic now enters through real AWS infrastructure, not a port-forward:

```bash
curl http://k8s-sampleapp-xxxx-1234567890.us-west-2.elb.amazonaws.com/healthz
```

```text
ok
```

The identical `Gateway` and `HTTPRoute` that ran behind NGINX Gateway Fabric on `kind` now front a production ALB on EKS. Contract unchanged; controller environmental — named explicitly by the `GatewayClass`.

### Watch for

- **The `Gateway` never goes `PROGRAMMED` (no `ADDRESS`)** — the controller is not running, lacks IAM permissions, the `GatewayClass` `parametersRef` points at a missing `LoadBalancerConfiguration`, or the `gatewayClassName` does not match an installed `GatewayClass`. `kubectl describe gateway sample-app -n app` and `kubectl get gatewayclass alb -o "jsonpath={.status.conditions}"` show the status; a missing-permissions error means the IAM service account did not attach the policy, and an `alb` class that never reaches `Accepted` usually means its `parametersRef` target does not exist.
- **The `HTTPRoute` is not `Accepted`** — `kubectl get httproute sample-app -n app -o "jsonpath={.status.parents}"` should show `Accepted=True`; if not, its `parentRefs` name does not match the `Gateway` in the same namespace. This is the same condition you watched on `kind`.
- **ALB provisions but returns 503** — the target group has no healthy targets, usually because `targetType: ip` (set in the `TargetGroupConfiguration`) requires the VPC CNI (which EKS has) and the Service/Pod readiness must pass. Confirm the app Pods are `Ready` and the Service selector matches; the ALB health check follows readiness.
- **Subnet discovery fails** (`couldn't auto-discover subnets`) — the ALB controller finds subnets by tag. On an `eksctl`-created cluster the subnets are tagged automatically; on the fallback cluster confirm the `kubernetes.io/role/elb` tags exist on the public subnets.

### Transition

EKS now has durable storage and a real load balancer — but we have been applying EKS-specific values (the gp3 class, the `alb` `GatewayClass`) by hand, on top of manifests that also have to keep working on `kind`. Segment 27 captures that environmental difference properly: a `kind` overlay and an `eks` overlay over the same untouched base.

---

## Segment 27 — 2:35 — Environment Overlays with Kustomize

**Stage:** Production.
**Duration:** 30 minutes.

### Goal

Express the difference between `kind` and EKS without editing the manifests. EKS needs different values than `kind` did — a different storage class, a different gateway class, a different replica count — and the wrong way to handle that is to hand-edit the base. Instead you add an `eks` overlay (a small set of patches) over the segment-14 base, and pair it with a `kind` overlay that records the values `kind` used. The base is untouched. The framing: a real cloud cluster needs different values, and an overlay is how Kustomize expresses that difference — not a mechanism for running two clusters at once.

### Talking points

- **The base from segment 14 stays exactly as it is.** Overlays **patch** the base; they do not rewrite it. Everything common to both environments — the Deployment shape, the Service, the probes, the CNPG `Cluster` — lives in the base unchanged. We are adding two thin overlays beside it, not forking the manifests.
- **An overlay is a set of patches plus a reference to the base.** Each overlay's `kustomization.yaml` names the base as a resource and lists patches that change only what differs for that environment. `kustomize build manifests/day-two/k8s/overlays/eks` produces the base with the EKS patches applied; `manifests/day-two/k8s/overlays/kind` does the same for `kind`.
- **What actually differs is small and concrete.** `kind`: local-path storage, the `nginx` GatewayClass, a low replica count. `eks`: the gp3 StorageClass, the `alb` GatewayClass, a higher replica count. Two short patch sets — not two copies of the app. Seeing how little differs is the lesson.
- **This is a migration aid, not multi-cluster.** The overlays let the same base run on a real cloud cluster; they do not run both clusters at once. Each overlay is reconciled by *that cluster's own* Argo CD (the `kind` base by segment 21's Argo CD, the `eks` overlay by segment 28's). There is no single Argo CD spanning both.

### Live build

Show the existing base from segment 14 — untouched — so it is clear what the overlays sit on top of:

```bash
ls manifests/day-one/k8s/base
```

```text
deployment.yaml  service.yaml  gateway.yaml  httproute.yaml
configmap.yaml  postgres-cluster.yaml  kustomization.yaml
```

Create the `kind` overlay: it references the base and patches in the values `kind` used — the local-path storage class, the `nginx` gateway class, and a low replica count. Writing the heredoc prints nothing on success — `manifests/day-two/k8s/overlays/kind/kustomization.yaml` is created:

```bash
cat > manifests/day-two/k8s/overlays/kind/kustomization.yaml <<'EOF'
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../../../day-one/k8s/base
patches:
  - path: gateway-class-nginx.yaml
    target: { kind: Gateway, name: sample-app }
  - path: replicas-2.yaml
    target: { kind: Deployment, name: sample-app }
EOF
```

Create the `eks` overlay: same base, but patched with the EKS-specific values — the `alb` GatewayClass (the ALB's behaviour lives in the `LoadBalancerConfiguration` and `TargetGroupConfiguration` CRDs the class references by `parametersRef`, applied in segment 26, not in this patch), the gp3 storage class on the CNPG `Cluster`, and a higher replica count. This too prints nothing on success, writing `manifests/day-two/k8s/overlays/eks/kustomization.yaml`:

```bash
cat > manifests/day-two/k8s/overlays/eks/kustomization.yaml <<'EOF'
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../../../day-one/k8s/base
patches:
  - path: gateway-class-alb.yaml
    target: { kind: Gateway, name: sample-app }
  - path: storageclass-gp3.yaml
    target: { kind: Cluster, name: postgres }
  - path: replicas-4.yaml
    target: { kind: Deployment, name: sample-app }
EOF
```

The five patch bodies these overlays reference — `gateway-class-nginx.yaml`, `replicas-2.yaml`, `gateway-class-alb.yaml`, `storageclass-gp3.yaml`, and `replicas-4.yaml` — live in the pre-flight materials alongside each overlay's `kustomization.yaml`; drop them in before building.

Confirm the base is unchanged by building the `eks` overlay and diffing the rendered output against the bare base — the only differences are the patched fields, proving the overlay patches rather than rewrites:

```bash
diff <(kubectl kustomize manifests/day-one/k8s/base) <(kubectl kustomize manifests/day-two/k8s/overlays/eks) | head -20
```

```text
<     gatewayClassName: nginx
---
>     gatewayClassName: alb
<   replicas: 2
---
>   replicas: 4
>   storageClass: gp3
```

A handful of lines differ — the gateway class, the storage class, the replica count — and nothing else. That is the entire environmental delta between `kind` and the cloud, captured as patches over one shared base.

### Watch for

- **`kustomize build` errors on a patch target that does not match** — the `target` selector (kind + name) must match a resource the base actually produces. A typo in the kind or name silently patches nothing or errors; confirm the target names against `kubectl kustomize manifests/day-one/k8s/base`.
- **A tempted edit to the base** — if a value "needs" to change for both environments, that belongs in the base; if it differs *between* them, it belongs in an overlay patch. The failure mode is editing the base to fix EKS and breaking `kind`. Keep environment-specific values out of the base entirely.
- **Overlay path wrong (`../../../../day-one/k8s/base` does not resolve)** — Kustomize resolves the base path relative to the overlay's own `kustomization.yaml`. From `manifests/day-two/k8s/overlays/eks/` the day-one base is four levels up; an off-by-one here is the most common "resource not found" build error.

### Transition

The environmental difference is now captured as two clean overlays over one base. The `eks` overlay describes the cloud end-state — but nothing is reconciling it from git yet. Segment 28 brings the Day-2-morning GitOps lesson into the cloud: Argo CD on EKS, pointed at the `eks` overlay, with EKS sealing its own copy of the secret.

---

## Segment 28 — 3:05 — GitOps on EKS

**Stage:** Production.
**Duration:** 30 minutes.

### Goal

Repeat the Day-2-morning GitOps lesson in the cloud. You install Argo CD on the **EKS** cluster — the same install as segment 21 — and point an `Application` at the `eks` overlay. The git repository that drove `kind` now drives EKS, a commit syncs, and you revisit drift detection in the UI. Then Sealed Secrets closes the same way: because a `SealedSecret` is encrypted against one cluster's key, you install the controller on EKS and seal the EKS copy of the Postgres Secret. Both are presented as the same lessons, now running against the cloud cluster — one Argo CD per cluster, one sealed copy per cluster, no wiring between them.

### Talking points

- **Argo CD lives in the cluster it manages — so EKS gets its own.** This is the same install as segment 21, on the EKS cluster, reconciling the `eks` overlay into EKS. We do **not** register EKS against the `kind` Argo CD, and the `kind` Argo CD is not running anymore (we migrated). One Argo CD per cluster, each reconciling its own overlay — that is the one-cluster-at-a-time rule made concrete.
- **The same repo drives both clusters via different overlays.** The git repository is the single source of truth; the `kind` Argo CD pointed at the base, the EKS Argo CD points at the `eks` overlay. Same repo, same base, environment-specific overlay — the portability lesson paying off.
- **The `SealedSecret` key is per-cluster — so EKS seals its own copy.** The `kind`-sealed `SealedSecret` from segment 23 cannot be decrypted by EKS; its key is different. So EKS installs its own Sealed Secrets controller and seals its own copy of the Postgres Secret into the `eks` overlay. This is a **property of how Sealed Secrets works**, not a cross-cluster problem and not a reason to wire the clusters together.
- **Drift detection works identically here.** Whatever you showed (or deferred from) segment 21, the cloud cluster reconciles git the same way: a hand-edit shows as `OutOfSync`, and self-heal reverts it. The mechanism does not change because the cluster is in the cloud.

### Live build

**Step 0 — Confirm the EKS context.** You are on the EKS context from segment 24. Confirm it before anything — every command this segment must hit EKS, not `kind`:

```bash
kubectl config current-context
```

```text
<your-aws-account>@fem-workshop.us-west-2.eksctl.io
```

**Step 1 — Install the Sealed Secrets controller on EKS** — its own controller, its own key:

```bash
kubectl apply -f \
  https://github.com/bitnami-labs/sealed-secrets/releases/latest/download/controller.yaml
```

```text
...
deployment.apps/sealed-secrets-controller created
```

**Step 2 — Seal the EKS copy of the Postgres Secret** against *this* cluster's key. Same fake demo value, sealed locally, written into the `eks` overlay — the plaintext never touches git. The pipeline prints nothing on success; the EKS-sealed, git-safe resource lands in `manifests/day-two/k8s/overlays/eks/sealed-db-extra.yaml`:

```bash
kubectl create secret generic db-extra -n app \
  --from-literal=password=demo-not-a-real-password \
  --dry-run=client -o yaml \
  | kubeseal --controller-namespace kube-system --format yaml \
  > manifests/day-two/k8s/overlays/eks/sealed-db-extra.yaml
```

Call out the improvement over segment 23: piping the plaintext straight into `kubeseal` over stdin is strictly **safer** than segment 23's write-to-disk-then-`rm` pattern, because the plaintext manifest never lands on disk at all — there is no temporary file to forget to delete, and nothing for `git add` to catch by accident. Only the sealed output is ever written. Prefer this stdin pattern wherever you can.

**Step 3 — Install Argo CD on EKS** — the same install as segment 21, on this cluster:

```bash
kubectl create namespace argocd
kubectl apply --server-side -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/v3.4.3/manifests/install.yaml
kubectl rollout status deployment/argocd-server -n argocd
```

```text
namespace/argocd created
...
deployment "argocd-server" successfully rolled out
```

**Step 4 — Point an `Application` at the `eks` overlay** (not the base) — the EKS Argo CD reconciling the cloud overlay into this cluster. `destination.server` is again the in-cluster API: this Argo CD manages the cluster it lives in, no external registration:

```bash
kubectl apply -n argocd -f - <<'EOF'
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: sample-app
spec:
  project: default
  source:
    repoURL: https://github.com/ALT-F4-LLC/fem-kubernetes
    targetRevision: main
    path: manifests/day-two/k8s/overlays/eks
  destination:
    server: https://kubernetes.default.svc
    namespace: app
  syncPolicy:
    automated: { prune: true, selfHeal: true }
EOF
```

```text
application.argoproj.io/sample-app created
```

**Step 5 — Watch it sync the `eks` overlay into the cloud cluster** — the sealed secret decrypts, the app comes up with the EKS values, all driven from git:

```bash
kubectl get application sample-app -n argocd
```

```text
NAME         SYNC STATUS   HEALTH STATUS
sample-app   Synced        Healthy
```

The same repository that drove `kind` this morning now drives EKS this afternoon — each through its own Argo CD, each over its own overlay, each sealing its own secret. One cluster operated at a time, the migration complete.

### Watch for

- **`Application` syncs the wrong path** — if it points at `manifests/day-one/k8s/base` instead of `manifests/day-two/k8s/overlays/eks`, the cloud cluster gets the `kind` values (nginx gateway class, low replicas). Confirm `path: manifests/day-two/k8s/overlays/eks` in the `Application`; this is the single most likely cause of "EKS came up with the wrong config."
- **Sealed secret will not decrypt on EKS** (`no key could decrypt secret`) — the `SealedSecret` was sealed against `kind`'s key, not EKS's. That is the per-cluster-key lesson firing: re-seal against the EKS controller (as above) into the `eks` overlay. A `kind`-sealed copy in the `eks` overlay is the classic mistake.
- **Accidentally on the `kind` context** — installing Argo CD or sealing "on EKS" while `current-context` is `kind-kind` puts everything on the wrong cluster. The `current-context` check at the top of this segment is the guard; re-run it if anything lands unexpectedly.

### Transition

The app is now fully GitOps-driven on EKS, secrets and all. Before tearing the cluster down, segment 29 shows how to watch a running cloud cluster without installing a metrics stack — the built-in `kubectl` signals plus EKS's own CloudWatch Container Insights.

---

## Segment 29 — 3:35 — Built-in & Platform Observability

**Stage:** Production.
**Duration:** 15 minutes.

### Goal

See what the cluster is doing without deploying an in-cluster observability stack. You walk the always-available built-in signals — `kubectl top` for live resource use, cluster and Pod events, and `kubectl rollout status` — then show EKS CloudWatch Container Insights as the platform-provided option. The lesson is that you get a long way on built-in and platform signals before a full metrics stack is worth its operational weight, and naming where that line is matters more than installing Prometheus.

### Talking points

- **`kubectl top` is the built-in resource view** — and it works because `metrics-server` is installed (segment 17), or on EKS via the metrics API. Live CPU and memory per Pod and per node, no extra tooling. It is the first thing you reach for to answer "what is using the cluster right now."
- **Events are the cluster's running narration.** `kubectl get events` (and the `Events` block at the bottom of `describe`) is where scheduling decisions, image pulls, probe failures, and evictions are recorded. When something is wrong, events usually said why — before any dashboard would have.
- **`kubectl rollout status` is observability for deploys** — the same command from segment 18, here framed as a signal: it tells you a rollout's real-time progress and whether it is healthy. Built-in signals are not just for debugging; they are how you watch routine operations.
- **EKS CloudWatch Container Insights is the platform option** — AWS collects cluster, node, Pod, and container metrics into CloudWatch without you running a metrics stack. It is the "your cloud provider already has somewhere to put this" answer for EKS. **Why we stop here:** a full in-cluster Prometheus/Grafana/Loki stack is its own operational burden — a service to run, scale, secure, and pay for — so this workshop deliberately stops at built-in and platform signals rather than installing one. (That sentence is the entire treatment — no stack is installed.)

### Live build

Live resource use, per Pod, in the app namespace — the built-in `top`:

```bash
kubectl top pods -n app
```

```text
NAME                          CPU(cores)   MEMORY(bytes)
sample-app-7d9c4b5f8-2xq4r    4m           38Mi
sample-app-7d9c4b5f8-9fk2p    3m           37Mi
postgres-1                    12m          120Mi
```

And per node, to see headroom on the EKS workers:

```bash
kubectl top nodes
```

```text
NAME                                          CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
ip-192-168-12-34.us-west-2.compute.internal    95m          4%     820Mi           11%
ip-192-168-56-78.us-west-2.compute.internal    78m          3%     760Mi           10%
```

The cluster's running narration — recent events in the app namespace, newest last:

```bash
kubectl get events -n app --sort-by=.lastTimestamp | tail -5
```

```text
LAST SEEN   TYPE     REASON      OBJECT                             MESSAGE
2m          Normal   Scheduled   pod/sample-app-7d9c4b5f8-2xq4r     Successfully assigned to ip-192-168-12-34
2m          Normal   Pulled      pod/sample-app-7d9c4b5f8-2xq4r     Container image already present
2m          Normal   Started     pod/sample-app-7d9c4b5f8-2xq4r     Started container sample-app
90s         Normal   SyncSucceeded   application/sample-app          successfully synced
```

Enable EKS CloudWatch Container Insights as a managed add-on — the platform collecting metrics for you, no in-cluster stack:

```bash
aws eks create-addon --cluster-name fem-workshop --region us-west-2 \
  --addon-name amazon-cloudwatch-observability
```

```text
{
  "addon": {
    "addonName": "amazon-cloudwatch-observability",
    "status": "CREATING"
  }
}
```

Point at the CloudWatch console (Container Insights) showing the cluster's metrics flowing in — node and Pod CPU/memory, all from the platform. That is as far as this workshop takes observability, and for a cluster this size it is plenty.

### Watch for

- **`kubectl top` errors with `Metrics API not available`** — on `kind` this means `metrics-server` is missing or unhealthy (segment 17); on EKS the metrics API should be present, but if Container Insights is still installing give it a moment. `kubectl top` and the CloudWatch add-on are independent — `top` does not need Container Insights.
- **Container Insights add-on stuck `CREATING` / `DEGRADED`** — usually the CloudWatch agent's IAM permissions are missing. This is a quick "point at the console once it is up" — do not debug IAM live in a 15-minute segment; the built-in `kubectl` signals are the substance here and need no AWS setup.
- **A student asks to add Prometheus** — that is the one-sentence talking point, not a demo. Name why the workshop stops short (a metrics stack is its own thing to run, scale, secure, and pay for) and move on; installing one is out of scope.

### Anticipated questions

**Q:** Is `kubectl top` plus events really enough observability for production?
**A:** For a small app, you get surprisingly far — `top`, events, and rollout status answer most "what is happening right now" questions, and the platform (CloudWatch here) covers historical metrics without you running anything. A larger system eventually wants a real metrics stack and centralized logs; the point of this segment is that you should reach for that when the built-in and platform signals stop being enough, not by default on day one.

### Transition

You can now watch the cluster without standing up a metrics stack. One responsibility remains, and it is not optional: the EKS cluster is billing by the hour right now. Segment 30 tears it down properly — and checks that nothing was left behind to keep billing.

---

## Segment 30 — 3:50 — Tearing It Down

**Stage:** Production.
**Duration:** 15 minutes.

### Goal

Tear the EKS cluster down completely — and verify nothing was left behind to keep billing. Every student runs `eksctl delete cluster`, then checks the AWS console that no EBS volumes and no load balancers were orphaned. This is load-bearing, not housekeeping: a cluster you forget about is a bill you did not budget for, and orphaned EBS volumes and load balancers keep charging long after the cluster is gone. The framing is operational discipline — cleanup is part of the job, not an afterthought.

### Talking points

- **Cleanup is operational discipline, not optional tidying.** An EKS control plane, its nodes, its EBS volumes, and its ALB all bill by the hour, independently. Deleting "the cluster" is necessary but not automatically sufficient — resources created *by* workloads (the gp3 volumes from segment 25, the ALB from segment 26) can outlive a careless delete. The discipline is: delete, then **verify**.
- **`eksctl delete cluster` tears down what `eksctl` created.** Because the cluster was created from the `eksctl` config, deleting it removes the control plane, node groups, and the CloudFormation stacks `eksctl` owns. It runs for several minutes; you start it and narrate the verification while it works.
- **Orphans come from resources `eksctl` did not create.** The ALB was created by the AWS Load Balancer Controller — which reconciles the `Gateway` into the ALB and attaches its security groups — and the EBS volumes by the EBS CSI driver, not directly by `eksctl`. The `Gateway` owns the ALB's lifecycle (the `HTTPRoute` is just routing rules layered on top), so if the `Gateway` and the PVCs are not cleaned up before (or as part of) the delete, those AWS resources can be left behind and keep charging. That is exactly what the post-delete check looks for.
- **"A forgotten cluster is an unbudgeted bill."** Say it plainly. The single most common cloud-workshop regret is a student whose cluster ran for a week after the workshop ended. The verification step is how you guarantee that does not happen to anyone in the room.
- **Deleting the cluster also destroys the Sealed Secrets controller's private key — fine here, not fine in production.** The controller's key lives in the cluster and is per-cluster, so `eksctl delete cluster` takes it with everything else. That is acceptable here only because the cluster is disposable and each cluster re-seals its own copy from the plaintext. In a real environment you would **back up the controller's private key before deleting** — lose it and every existing `SealedSecret` sealed against it becomes permanently undecryptable, even from a clean restore of the git repo.

### Live build

Start the deletion. It runs for several minutes in the background while you walk the orphaned-resource check — do not wait silently on it:

```bash
eksctl delete cluster -f eks-cluster.yaml --region us-west-2
```

```text
2026-06-03 15:51:02 [ℹ]  deleting EKS cluster "fem-workshop"
2026-06-03 15:51:05 [ℹ]  will delete stack "eksctl-fem-workshop-cluster"
2026-06-03 15:51:06 [ℹ]  waiting for CloudFormation stack to be deleted ...
```

While that runs, check for orphaned load balancers — there should be none once the controller cleaned up the ALB from the deleted `Gateway`. An empty result is the goal:

```bash
aws elbv2 describe-load-balancers --region us-west-2 \
  --query 'LoadBalancers[?contains(LoadBalancerName, `k8s-sampleapp`)].LoadBalancerArn'
```

```text
[]
```

Check for orphaned EBS volumes — the gp3 volumes from segment 25 should be gone (the CNPG PVCs and their volumes deleted with the cluster). `available` volumes with the cluster tag are the orphans to watch for; an empty result means clean:

```bash
aws ec2 describe-volumes --region us-west-2 \
  --filters Name=tag:kubernetes.io/cluster/fem-workshop,Values=owned Name=status,Values=available \
  --query 'Volumes[].VolumeId'
```

```text
[]
```

Both checks above returned an empty list, which is the clean case and the one you want students to see. Run the next two commands only if a check came back non-empty — name this on stage so students know the recovery, not just the happy path. Substitute the volume ID or load-balancer ARN the check above printed for the placeholders:

```bash
aws ec2 delete-volume --region us-west-2 --volume-id <volume-id>
aws elbv2 delete-load-balancer --region us-west-2 --load-balancer-arn <load-balancer-arn>
```

Confirm the cluster itself is gone once the delete finishes — `eksctl` lists no cluster, and the context can be removed:

```bash
eksctl get cluster --region us-west-2
```

```text
No clusters found in us-west-2.
```

The cluster is down, no volumes or load balancers were left behind, and nothing is billing. That verification — not just the delete command — is the discipline. No one leaves Day 2 with a running EKS cluster.

### Watch for

- **`eksctl delete cluster` errors with a stuck CloudFormation stack** — usually a leftover resource (an ALB or a security group still in use) blocks stack deletion. The orphaned-resource checks above find it; delete the blocker explicitly, then re-run the cluster delete. This is precisely why the verification step exists.
- **The ALB is orphaned because the `Gateway` was not deleted first** — deleting the cluster does not always clean up the controller-created ALB if the controller is torn down before it processes the `Gateway` removal. The `Gateway` owns the ALB, so it is the resource to remove first. If the load-balancer check is non-empty, delete the ALB explicitly with the recovery command above. Mention deleting the `Gateway` before the cluster as the clean path.
- **A student is on the wrong context and "nothing deletes"** — `eksctl delete cluster -f eks-cluster.yaml` operates on the config's cluster regardless of `kubectl` context, but confirm the `--region` matches where the cluster actually runs. A region mismatch is why a delete "succeeds" but the bill continues.

### Transition

The cloud cluster is gone and verified clean. That closes the build — every piece the workshop set out to add is in place, and nothing is left running to charge for. Segment 31 steps back and names the whole arc Production delivered.

---

## Segment 31 — 4:05 — Day 2 Recap: End of Production

**Stage:** Production.
**Duration:** 10 minutes.

### Goal

Close the workshop's technical content by naming everything Production added and confirming the migration to EKS is complete. This is the end-of-Production recap: no "still wrong" list, because Production is the end of the maturity arc — the app that started as a bare Pod is now the state you would hand to an on-call rotation. The instructor steps back and replays what the stage delivered, then hands off to the Wrap-Up interlude.

### Talking points

- **Production hardened the app and then moved it to the cloud.** The morning made the app autoscale, deploy safely, survive node drains, run least-privileged, and reconcile from git with secrets sealed. The afternoon stood the same app up on a real EKS cluster — durable EBS storage, an ALB front door, an `eks` overlay over the same base, its own Argo CD and its own sealed secret — then tore it back down cleanly.
- **The contract-vs-controller theme paid off end to end.** The same PVC bound to local-path on `kind` and to a real EBS volume on EKS; the same `Gateway` and `HTTPRoute` were fulfilled by NGINX Gateway Fabric on `kind` and a real ALB on EKS; the same Kustomize base ran on both via environment overlays. The route was the stable contract; the controller behind it was environmental — named by the `GatewayClass`, exactly as Day 1 previewed.
- **One cluster at a time, start to finish.** The migration was `kind` then EKS — never both at once, never one Argo CD across both, never an external-cluster registration. Each cluster ran its own Argo CD over its own overlay and sealed its own secret. That restraint is itself a Production lesson: the workshop's audience learns to operate one cluster well before reaching for fleet management.

### Transition

That is the technical content. The Wrap-Up interlude that follows replays the full two-day arc — the same application from a single bare Pod to an autoscaled, GitOps-managed deployment on a real cloud cluster — and points students at the documentation and the stage branches for the byte-for-byte end-state of each stage.

### Recap — end of Production

Production took the teammate-ready app from end of Stable and made it on-call-ready, then migrated it to the cloud. What this stage added:

- **Autoscaling.** A HorizontalPodAutoscaler sizes the app to load on CPU, scaling up under traffic and back down when it subsides — no manual `kubectl scale`.
- **Safe rollouts and rollback.** A rolling-update strategy gated by readiness probes turns a bad deploy into a stalled, non-disruptive event, and `kubectl rollout undo` reverts to a known-good revision in one command.
- **Node-drain survival.** A PodDisruptionBudget plus multiple replicas keeps the app serving through a `kubectl drain` — voluntary node maintenance is now invisible to users.
- **Least-privilege identity.** A dedicated ServiceAccount with a tightly-scoped Role and RoleBinding replaces the over-permissioned default — the workload can do its job and nothing else.
- **GitOps with Argo CD.** Git is the source of truth; Argo CD reconciles the cluster to match it and flags (and self-heals) drift — no more deploying by hand.
- **Git-safe secrets.** Sealed Secrets and `kubeseal` make the remaining secret safe to commit to a public repo, with each cluster sealing its own copy against its own key.
- **Migrated to EKS over the same base.** Durable EBS storage via the EBS CSI driver and a gp3 StorageClass, a real ALB via the AWS Load Balancer Controller, and an `eks` Kustomize overlay over the untouched segment-14 base carried the same application onto a real cloud cluster — then segment 30 tore it down cleanly, with no orphaned resources left billing.

The migration to EKS is complete. The same small app that began as a single bare Pod on a laptop now autoscales, deploys safely, survives disruption, runs least-privileged, keeps its secrets git-safe, and is reconciled from git on a real cloud cluster — the state you would hand to an on-call rotation. That closes the technical arc of the workshop.
