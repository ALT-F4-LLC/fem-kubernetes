# Stable — Instructor Guide

This is the **Stable** stage of the workshop — OUTLINE segments 8-14, the Day-1 afternoon block (12:45-4:15) that immediately follows lunch. It takes the deliberately-wrong POC stack and turns every wrong choice into the right one: imperative commands become declarative manifests in git, the app gains health probes and resource limits, the secret moves out of shell history, a real front door — a `Gateway` and an `HTTPRoute` — replaces the NodePort, and the ephemeral Postgres is replaced by a durable CloudNativePG cluster. By the end of this stage the app is the state you would hand a teammate — declarative, probed, resource-bounded, gateway-fronted, and durably Postgres-backed — though still on one local cluster with no autoscaling, rollback discipline, or node-loss story. Those are Production's job.

**Stage at a glance.**
- **Delivers:** declarative manifests in git, health probes, resource limits, a real front door (a `Gateway` and an `HTTPRoute`), durable CloudNativePG Postgres, and the secret out of shell history.
- **End state:** the app you'd hand a teammate — declarative, probed, resource-bounded, gateway-fronted, durably Postgres-backed — on one local cluster.
- **Next:** Production adds autoscaling, rollout/rollback, node-loss survival, GitOps, and the EKS migration.

**How to read this guide.** Each segment below follows the same fixed section order — Goal, Talking points, Live build, Watch for, then an optional Anticipated questions, then Transition — so your eye lands in the same place every time. The fenced command blocks are exactly what you type on stage; one logical step per block, with prose between blocks narrating the build. Output blocks are **representative** — they show the shape and the teaching signal a command produces, not a literal capture, so pod-name suffixes, ages, IPs, and CNPG-generated credentials will differ on your machine. Every hand-authored secret value shown is **deliberately fake**.

> **Scope guard — keep these in mind on stage.**
>
> **Stage design choices that bind Stable (enforce these):**
> - **Declarative hinge (segment 8).** Every imperative command from the POC morning is rewritten as a manifest committed to git, applied with `kubectl apply` and inspected with `kubectl diff`. Labels and selectors are hand-written. The line to say out loud: imperative commands are how you *explore*; manifests are how you *operate*.
> - **The secret moves into a Secret — created imperatively, not committed (segment 10).** The Postgres password leaves the inline env var and becomes a `Secret` created with `kubectl create secret`, which is **not** committed to git. Mandatory talking point: a Kubernetes Secret is **base64-encoded, not encrypted**. Namespaces arrive here as the boundary between the app and cluster tooling; this is where the `app` namespace is introduced. Use an obviously-fake demo value (`demo-not-a-real-password`); never type a real-looking secret.
> - **Durable Postgres is a CloudNativePG `Cluster`, never a hand-written StatefulSet (segment 13).** You declare a CNPG `Cluster` custom resource — you do **not** hand-write a `StatefulSet`, headless Service, and PVC. Mandatory talking point: CNPG manages Pods and PVCs much as a hand-written StatefulSet would, plus failover and backup. The secrets thread continues: CNPG generates and owns the credentials in its auto-created `-app` Secret, and the hand-rolled segment-10 Secret is retired.
> - **Kustomize is base only (segment 14).** You introduce a Kustomize *base* at `k8s/base/` — a `kustomization.yaml` over the Stable manifests, applied with `kubectl apply -k k8s/base`. Do **not** preview overlays; the `overlays/kind` and `overlays/eks` overlays are Production (segment 27). Segment 14 carries the end-of-Stable recap.
>
> **Explicitly out of scope for the whole workshop (decline on stage without improvising):**
> - **No Helm.** Kustomize is the only manifest-management tool taught — and it arrives in this stage at segment 14.
> - **No hand-written StatefulSet** for Postgres. Durability is the CloudNativePG operator (segment 13); the segment-13 talking point explains what CNPG manages under the hood.
> - **No in-cluster observability stacks** (Prometheus, Grafana, Loki, LGTM). Only built-in signals (`kubectl get`, `describe`, `logs`, `top`, events, rollout status) and, later, platform-provided observability.
> - **No service mesh** (Istio, Linkerd, Cilium service mesh).
> - **No authoring a custom operator** — the workshop *consumes* CloudNativePG in segments 12-13; it never writes a controller.
> - **No multi-cluster operation** — one cluster at a time. Stable runs entirely on the single `kind` cluster built in Foundations; EKS is a Day-2 migration, never side by side.

---

## Segment 8 — 12:45 — From Imperative to Declarative

**Stage:** Stable.
**Duration:** 45 minutes.

### Goal

Reframe everything from the morning. Take the app and Postgres Deployments and the Services that were created imperatively in POC, and re-express them as YAML manifests committed to git. Introduce `kubectl apply` as the declarative verb, `kubectl diff` as the way to see a change before it lands, and hand-written labels and selectors as the glue that wires resources together. This is the conceptual hinge of Day 1 — the single longest segment — because the rest of Stable assumes students are fluent reading a manifest. Nothing about *what runs* changes; *how it is described* changes completely.

### Talking points

- **Imperative is how you explore; manifests are how you operate.** Every `kubectl run`, `create deployment`, `scale`, `expose`, and `set env` from the morning was a one-shot instruction with no record. A manifest is the desired state written down — reviewable, diffable, recreatable, and version-controlled. The desired state is the same one from Foundations — the speed you set on cruise control, the ticket on the kitchen rail — only now it lives in a file instead of in your head, so the cluster can reconcile toward it and you can diff it before it lands. This is the line the whole afternoon turns on; say it out loud.
- **`kubectl apply` is declarative reconciliation.** You hand Kubernetes the state you want and it figures out the difference from what exists and converges. Re-applying an unchanged manifest is a no-op — that idempotence is the point. Contrast it with the morning's imperative commands, each of which assumed a specific starting state.
- **`kubectl diff` shows the change before you make it.** Before any `apply`, `kubectl diff` prints exactly what would change against the live cluster. On a permanent recording, narrate that this is the habit that keeps you from surprising a cluster — see the diff, then apply.
- **Labels and selectors are the wiring, and now you write them by hand.** In POC, `kubectl expose` guessed the selector for you. A manifest makes it explicit: a Deployment stamps labels onto its Pods, and a Service's `selector` must match those labels exactly or it fronts nothing. This is the most common manifest bug, so make the match visible.
- **Everything here goes into git.** The first POC sin was "nothing is in git." From this segment on, the manifests are the source of truth and they live in a repository. The imperative cluster state from the morning is about to be replaced by applied manifests.

### Live build

**Step 1 — clean slate.** Start from a clean slate so the cluster reflects the manifests and nothing else. Delete the imperatively-built resources from the morning — the manifests are about to become the single source of truth.

```bash
kubectl delete deployment sample-app postgres
kubectl delete service sample-app postgres
```

```text
deployment.apps "sample-app" deleted
deployment.apps "postgres" deleted
service "sample-app" deleted
service "postgres" deleted
```

**Step 2 — app Deployment manifest.** Write the app Deployment as a manifest. Note the hand-written labels and the matching selector — the `matchLabels` under the Deployment must equal the labels stamped onto the Pod template, or the controller owns nothing.

```bash
cat > deployment.yaml <<'EOF'
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
EOF
```

**Step 3 — diff before apply.** Before applying anything, run a diff against the live cluster. With the resource absent, `diff` shows the whole object as a creation — that is the habit to build: see it, then apply it.

```bash
kubectl diff -f deployment.yaml
```

```text
diff -u -N /tmp/LIVE-.../apps.v1.Deployment.default.sample-app /tmp/MERGED-.../apps.v1.Deployment.default.sample-app
+apiVersion: apps/v1
+kind: Deployment
+metadata:
+  name: sample-app
...
```

**Step 4 — apply, and prove idempotence.** Apply it. The app comes back — this time from a file, not a typed command.

```bash
kubectl apply -f deployment.yaml
```

```text
deployment.apps/sample-app created
```

Re-apply the exact same file to make the point that `apply` is idempotent — nothing changes because the desired state already matches.

```bash
kubectl apply -f deployment.yaml
```

```text
deployment.apps/sample-app unchanged
```

**Step 5 — Postgres Deployment manifest.** Write the Postgres Deployment the same way. This is still the ephemeral, no-volume Postgres from POC — segment 13 replaces it; here you are only changing *how it is described*.

```bash
cat > postgres.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  labels:
    app: postgres
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_PASSWORD
              value: demo-not-a-real-password
EOF
kubectl apply -f postgres.yaml
```

```text
deployment.apps/postgres created
```

**Step 6 — Service manifests.** Write the two Services as manifests, making the `selector` explicit. The `postgres` Service is a `ClusterIP`; the app Service is still a `NodePort` here (the `Gateway` that replaces it is segment 11).

```bash
cat > service.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: postgres
spec:
  selector:
    app: postgres
  ports:
    - port: 5432
      targetPort: 5432
---
apiVersion: v1
kind: Service
metadata:
  name: sample-app
spec:
  type: NodePort
  selector:
    app: sample-app
  ports:
    - port: 8080
      targetPort: 8080
EOF
kubectl apply -f service.yaml
```

```text
service/postgres created
service/sample-app created
```

**Step 7 — confirm the stack.** Confirm the full stack is back, now entirely from manifests. Point out that the cluster state is identical to the end of POC — but every piece of it is now described by a file you can commit.

```bash
kubectl get deployments,services
```

```text
NAME                         READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/postgres     1/1     1            1           40s
deployment.apps/sample-app   1/1     1            1           90s

NAME                 TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)          AGE
service/postgres     ClusterIP   10.96.142.30    <none>        5432/TCP         40s
service/sample-app   NodePort    10.96.88.114    <none>        8080:31480/TCP   90s
```

**Step 8 — commit.** Commit the manifests. This is the moment that pays off the first POC sin — the desired state is now in git.

```bash
git add deployment.yaml postgres.yaml service.yaml
git commit -m "Declare app, Postgres, and Services as manifests"
```

```text
[stable a1b2c3d] Declare app, Postgres, and Services as manifests
 3 files changed, 78 insertions(+)
```

### Watch for

- **The Service fronts nothing** (`kubectl get endpoints sample-app` shows an empty list). The Service `selector` does not match the Pod's labels — the single most common manifest bug. Compare the `spec.selector` in the Service to `spec.template.metadata.labels` in the Deployment; they must be identical. This is exactly why you write both by hand here — so the match is visible.
- **`kubectl diff` exits non-zero or "errors."** `diff` returns a non-zero exit code *whenever there is a difference* — that is success, not failure. Only treat it as broken if it prints a real error (e.g. a connection problem), not merely because it found a change to show.
- **`apply` after an imperative `create` complains about ownership.** If a resource still lingers from the morning's imperative commands, `apply` may warn about a missing `last-applied-configuration` annotation. The clean-slate delete at the top of this segment avoids it; if it bites, delete the stray resource and re-apply from the file.

### Transition

The whole POC stack now exists as manifests in git, applied declaratively — the cluster's desired state is written down and reviewable for the first time. With the manifests in hand, the rest of Stable adds the production-readiness pieces POC left out, starting with the most basic one: Kubernetes still cannot tell a healthy Pod from a wedged one.

---

## Segment 9 — 1:30 — Health Checks & Resource Management

**Stage:** Stable.
**Duration:** 30 minutes.

### Goal

Give Kubernetes the ability to tell a healthy Pod from a wedged one, and bound what each Pod is allowed to consume. Add readiness, liveness, and startup probes to the app's Deployment manifest, then add resource requests and limits. Prove the liveness probe works by breaking the app's health endpoint on purpose and watching Kubernetes restart the Pod. Everything is an edit to the manifest from segment 8, applied with `kubectl apply` — the declarative habit continues.

### Talking points

- **Three probes, three different questions.** *Readiness* asks "should this Pod receive traffic right now?" — a failing readiness probe pulls the Pod out of the Service's endpoints without killing it. *Liveness* asks "is this Pod wedged and in need of a restart?" — a failing liveness probe restarts the container. *Startup* asks "has the app finished booting?" — it holds off the other two until the app is up, so a slow start is not mistaken for a failure.
- **Without probes, a hung app keeps getting traffic.** This is the POC gap made concrete: a process that is running but not serving still shows `Running`, and the Service keeps routing to it. Probes are how the control loop learns the difference between "the process exists" and "the app works."
- **Requests are for scheduling; limits are for protection.** A *request* is what the scheduler reserves when placing the Pod — it is the floor the node guarantees. A *limit* is the ceiling the Pod cannot exceed — exceed the CPU limit and you get throttled, exceed the memory limit and you get OOM-killed. The POC gap was that nothing bounded a runaway container; this closes it.
- **The probe endpoint is the app's `/healthz`.** The app already serves `/healthz` — that is the endpoint the probes hit. Breaking it on purpose, in a moment, is how you make the liveness probe visible.

### Live build

Edit the app Deployment manifest to add the three probes and resource requests and limits. The probes all target the app's `/healthz` endpoint on the container port.

```bash
cat > deployment.yaml <<'EOF'
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
          startupProbe:
            httpGet:
              path: /healthz
              port: 8080
            failureThreshold: 30
            periodSeconds: 2
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8080
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            periodSeconds: 10
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 256Mi
EOF
```

Diff before applying — this is the habit from segment 8. The diff shows exactly the probes and resources being added to the live Deployment.

```bash
kubectl diff -f deployment.yaml
```

```text
...
+          livenessProbe:
+            httpGet:
+              path: /healthz
+              port: 8080
+          resources:
+            requests:
+              cpu: 100m
...
```

Apply it. The Deployment rolls out a new Pod with the probes attached.

```bash
kubectl apply -f deployment.yaml
```

```text
deployment.apps/sample-app configured
```

Confirm the new Pod becomes ready — readiness gating means it only reports `READY 1/1` once the startup and readiness probes pass.

```bash
kubectl get pods
```

```text
NAME                          READY   STATUS    RESTARTS   AGE
sample-app-6f4d8c7b9-tq2lp    1/1     Running   0          25s
```

Now make the liveness probe visible by breaking the health endpoint on purpose. The app exposes a way to force `/healthz` to start failing — here, hit a debug toggle from inside the Pod (your app may expose this differently; the point is to make `/healthz` return non-200).

```bash
kubectl exec deploy/sample-app -- sh -c 'kill -USR1 1'
```

Watch the Pod. The liveness probe fails its threshold, Kubernetes restarts the container, and the `RESTARTS` count ticks up — the probe caught a wedged app and self-healed it.

```bash
kubectl get pods --watch
```

```text
NAME                          READY   STATUS    RESTARTS      AGE
sample-app-6f4d8c7b9-tq2lp    1/1     Running   0             90s
sample-app-6f4d8c7b9-tq2lp    0/1     Running   0             100s
sample-app-6f4d8c7b9-tq2lp    1/1     Running   1 (5s ago)    115s
```

Read the events to show *why* it restarted — the liveness probe failure is named explicitly.

```bash
kubectl describe pod -l app=sample-app
```

```text
Events:
  Type     Reason     Age                From               Message
  ----     ------     ----               ----               -------
  Warning  Unhealthy  20s (x3 over 30s)  kubelet            Liveness probe failed: HTTP probe failed with statuscode: 500
  Normal   Killing    20s                kubelet            Container sample-app failed liveness probe, will be restarted
  Normal   Pulled     18s                kubelet            Container image already present on machine
```

Commit the hardened manifest.

```bash
git add deployment.yaml
git commit -m "Add health probes and resource requests/limits to app"
```

```text
[stable b2c3d4e] Add health probes and resource requests/limits to app
 1 file changed, 28 insertions(+)
```

### Watch for

- **The Pod never reaches `READY 1/1`** after adding probes. The readiness probe path or port is wrong, or the startup probe's `failureThreshold × periodSeconds` is too short for the app's real boot time. Check `kubectl describe pod` for the probe failure message; confirm `/healthz` and port `8080` match what the app actually serves.
- **`CrashLoopBackOff` after adding limits.** The memory limit is below what the app needs to start, so it is OOM-killed on boot. `kubectl describe pod` shows `OOMKilled` as the last state. Raise the memory limit; the representative values here are illustrative, not tuned for the real image.
- **The liveness break doesn't restart the Pod.** The toggle did not actually make `/healthz` fail, or the liveness `failureThreshold` has not been reached yet. Confirm `/healthz` returns non-200 (`kubectl exec deploy/sample-app -- curl -s localhost:8080/healthz`), then give the probe its interval to trip.

### Transition

The app now tells Kubernetes the truth about its health and lives inside resource bounds — two POC gaps closed. But its configuration is still inline in the manifest, including the database password sitting in plaintext in a file headed for git. The next segment pulls configuration out into ConfigMaps and Secrets, and introduces namespaces to separate the app from cluster tooling.

---

## Segment 10 — 2:00 — ConfigMaps, Secrets & Namespaces

**Stage:** Stable.
**Duration:** 30 minutes.

### Goal

Move configuration out of inline environment variables. The non-sensitive database connection details become a `ConfigMap`; the database password becomes a `Secret` created imperatively with `kubectl create secret` and deliberately **not** committed to git. Introduce namespaces as the boundary that separates the app's resources from cluster tooling, establishing the `app` namespace the rest of Stable uses. This is the second beat of the secrets thread: the password leaves the manifest, but the Secret it moves into is base64-encoded, not encrypted — and it exists only in the cluster, which is a new gap to name.

### Talking points

- **A ConfigMap is for non-secret config; a Secret is for sensitive values.** Both decouple configuration from the image and the Deployment manifest, so the same image runs differently per environment. The split is about *sensitivity*, not mechanism — a Secret is handled with more care, but as you are about to show, "more care" is not "encryption."
- **Inline in the Deployment, the password is readable by anyone who can read the Deployment.** The plaintext `POSTGRES_PASSWORD`/`DB_PASSWORD` value from segments 8-9 sits in the Deployment's `env`, so `kubectl get deploy -o yaml` (or anything with read access to the Deployment) prints it in the clear — separate from the git problem. Moving it into a Secret narrows who needs read access to the password from "everyone who can see the Deployment" to "whoever can read the Secret," which RBAC can scope independently. That is the reason this segment pulls it out, base64 caveat and all.
- **A Kubernetes Secret is base64-encoded, NOT encrypted.** Say this plainly and prove it: anyone who can read the Secret can decode the value with `base64 -d`. base64 is an encoding, not a cipher — it is there so binary values survive transport, not to protect anything. This is the load-bearing talking point of the segment.
- **So we create the Secret imperatively and keep it out of git.** Because base64 is not encryption, committing a Secret manifest to git would be committing the password in plain sight. We create it with `kubectl create secret` — it lives only in the cluster — and we do not write a manifest for it. The new gap, name it out loud: the "declarative" setup is now incomplete, because one piece of state (the Secret) exists only in the cluster and not in git. Production's Sealed Secrets closes that gap; CNPG in segment 13 removes this hand-rolled Secret entirely.
- **Namespaces are the app/tooling boundary.** A namespace scopes names and groups resources. The app's resources move into a dedicated namespace (`app`), separate from the `kube-system` and operator tooling that will arrive in segments 11-13. This is the boundary that keeps "my app" and "the platform" from colliding.
- **The discipline is yours, not the tooling's.** Nothing in the repo automatically blocks a plaintext Secret manifest from being committed — `kubectl create secret` keeps the value out of git only because *you* never write a manifest for it and never `git add` one. Name that this is a habit, not a guardrail. If you want a belt-and-suspenders, the instructor can add a narrow pre-flight `.gitignore` entry that ignores the specific filename they'd use for a hand-written Secret (not a broad `*secret*` glob — that would also ignore the Sealed Secret manifests Production *must* commit). State plainly: absent that, a plaintext Secret is fully committable, so the discipline is what protects the password.

### Live build

Create the namespace that will hold the app's resources. Everything from here lives in `app` rather than `default`.

```bash
kubectl create namespace app
```

```text
namespace/app created
```

Move the non-secret database connection details into a ConfigMap. These are the values it is fine to commit — host, port, database name — so this one *is* a manifest headed for git.

```bash
cat > configmap.yaml <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: db-config
  namespace: app
data:
  DB_HOST: postgres
  DB_PORT: "5432"
  DB_NAME: appdb
EOF
kubectl apply -f configmap.yaml
```

```text
configmap/db-config created
```

Create the password as a Secret **imperatively** — this is the deliberate choice. It lives only in the cluster; there is no manifest for it and nothing to commit. Use the obviously-fake demo value; narrate that on a permanent recording this value must never be real.

```bash
kubectl create secret generic db-secret \
  --namespace=app \
  --from-literal=DB_PASSWORD=demo-not-a-real-password
```

```text
secret/db-secret created
```

Now prove the talking point: base64 is not encryption. Pull the stored value back out and decode it — anyone with read access sees the password.

```bash
kubectl get secret db-secret -n app -o jsonpath='{.data.DB_PASSWORD}' | base64 -d
```

```text
demo-not-a-real-password
```

Let that land: the value came straight back out with a standard tool, no key required. That is exactly why this Secret is not committed to git, and why Production seals it.

Update the app Deployment to read configuration from the ConfigMap and the Secret instead of inline env values, and to live in `app`. Use `envFrom`/`valueFrom` so the values flow from the new sources.

```bash
cat > deployment.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sample-app
  namespace: app
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
          envFrom:
            - configMapRef:
                name: db-config
          env:
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: DB_PASSWORD
          startupProbe:
            httpGet:
              path: /healthz
              port: 8080
            failureThreshold: 30
            periodSeconds: 2
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8080
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            periodSeconds: 10
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 256Mi
EOF
```

Before applying into `app`, tear down the segment 8/9 stack still running in `default`. Those Deployments and Services were created there, and applying into a new namespace does not move them — left alone they would be an orphaned duplicate, which breaks the clean-slate discipline. Delete them so `app` is the only place the app runs.

```bash
kubectl delete -n default deployment sample-app postgres
kubectl delete -n default service sample-app postgres
```

```text
deployment.apps "sample-app" deleted
deployment.apps "postgres" deleted
service "sample-app" deleted
service "postgres" deleted
```

Now apply the app and the Postgres Deployment into the new namespace, and the Services there too. Because nothing of the app exists in `app` yet, all four resources are created fresh. Confirm the app reads its config from the ConfigMap and Secret with no inline password anywhere in the manifest.

```bash
kubectl apply -n app -f deployment.yaml -f postgres.yaml -f service.yaml
```

```text
deployment.apps/sample-app created
deployment.apps/postgres created
service/postgres created
service/sample-app created
```

Confirm the app Pod comes up reading its new configuration sources.

```bash
kubectl get pods -n app
```

```text
NAME                          READY   STATUS    RESTARTS   AGE
postgres-6b8c9d7f5-mn2kq      1/1     Running   0          30s
sample-app-7c9f5d4b6-k8w2n    1/1     Running   0          30s
```

Commit only what is safe — the ConfigMap and the updated Deployment. The Secret is **not** here, by design.

```bash
git add configmap.yaml deployment.yaml
git commit -m "Move config to ConfigMap, password to imperative Secret"
```

```text
[stable c3d4e5f] Move config to ConfigMap, password to imperative Secret
 2 files changed, 24 insertions(+), 4 deletions(-)
```

### Watch for

- **App `CrashLoopBackOff` with a missing-password error.** The `secretKeyRef` name or key does not match the Secret you created. Confirm the Secret exists in the right namespace (`kubectl get secret db-secret -n app`) and that the `key` in the Deployment matches the `--from-literal` key (`DB_PASSWORD`).
- **`namespaces "app" not found`** on apply. The manifests carry a namespace that does not exist yet, or you forgot `-n`. Create the namespace first; the namespace in the manifest `metadata` and any `-n` flag must agree.
- **A student notices the Secret isn't in git and asks if that's a mistake.** It is the lesson, not a mistake — say so. The Secret is intentionally out of git because base64 is not encryption; the gap that creates is exactly what Production's Sealed Secrets closes.

### Anticipated questions

**Q:** If a Secret is just base64, why use it at all instead of a ConfigMap?

**A:** A few real reasons even without encryption-at-rest configured: Secrets are mounted in `tmpfs` rather than written to node disk, they are redacted from `kubectl get` output by default, RBAC can be scoped to them separately from ConfigMaps, and the cluster *can* be configured to encrypt them at rest. The talking point is that base64 is not itself the protection — the protections come from how Secrets are handled, and committing one to git throws all of that away.

Be precise about that last one on a recording: encryption of Secrets **at rest in etcd is a separate, cluster-level feature whose default varies by platform** — on a self-managed cluster it is off unless you explicitly enable it. On a self-managed cluster that means configuring an `EncryptionConfiguration` on the API server; on EKS running Kubernetes 1.28+, envelope encryption of Secrets at rest is on by default with an AWS-owned KMS key (a customer-managed key is the opt-in upgrade), and only on older EKS (≤1.27) was secret encryption itself an opt-in cluster-creation option. So "the Secret is stored in etcd" does **not** by itself imply it is encrypted at rest — on a self-managed cluster (and the workshop's `kind` cluster) the base64 value sits in etcd as-is unless you turn encryption on. That is the reinforcing reason the Secret value stays sensitive even once it has left the Deployment: it is no more encrypted in the cluster's datastore than it was base64-encoded in the manifest, unless someone turned that feature on. Do not claim the workshop's `kind` cluster has it enabled — it does not.

### Transition

Configuration now lives in a ConfigMap, the password in a cluster-only Secret, and the app in its own namespace — and we have named the gap that the imperative Secret leaves open. Next we replace the last crude piece of POC networking: the NodePort. The app gets a real front door via the Gateway API — a `Gateway` and an `HTTPRoute` fulfilled by a controller we install on the cluster.

---

## Segment 11 — 2:30 — Gateway API

**Stage:** Stable.
**Duration:** 30 minutes.

### Goal

Replace the POC NodePort with a real front door. Install NGINX Gateway Fabric on the `kind` cluster, then write a `Gateway` (a listener) and an `HTTPRoute` (host and path routing to the app's Service). The teaching point is the split between the route — a stable, portable contract — and the controller that fulfills it, which is environment-specific. That split is the same lesson the storage segments teach, and it pays off on EKS in segment 26 where the AWS Load Balancer Controller fulfills the very same `Gateway` and `HTTPRoute`.

### Talking points

- **The route is a contract; the controller is environment-specific.** A `Gateway` plus an `HTTPRoute` declares *how traffic should reach the app* — a listener, plus host, path, and target Service — and says nothing about *how* that routing is realized. A controller watches these resources and makes them real. The route is portable; the controller is chosen per environment, named by the `GatewayClass` the `Gateway` points at.
- **Three resources where Ingress was one — but only one new idea.** Gateway API splits the old single `Ingress` into roles: a `GatewayClass` (cluster-scoped, names the controller), a `Gateway` (the listener), and an `HTTPRoute` (the routing rules). The `GatewayClass` is install-time plumbing — the controller's manifest installs it and you just reference it by name, exactly as `IngressClass` worked. The `Gateway` and `HTTPRoute` are the listener-plus-rules split you half-saw inside the old `Ingress` spec, now named separately.
- **That is why we install a controller separately.** A `Gateway` with no controller does nothing — it is a declaration nobody is acting on. On `kind` we install NGINX Gateway Fabric, whose `GatewayClass` is named `nginx`; on EKS in Day 2 we install the AWS Load Balancer Controller. Same `Gateway` and `HTTPRoute`, different controller. This is the two-controllers-on-purpose design: students see firsthand that the route survives the environment change.
- **This replaces the NodePort.** POC reached the app through a raw node port — crude, and not how you expose a real app. The `Gateway` is the stable, named entry point that real clusters use. The NodePort Service can become a plain `ClusterIP` now that the `Gateway` fronts it.
- **NGINX Gateway Fabric on `kind` needs the node to accept gateway traffic.** NGF ships a NodePort manifest variant for local clusters like `kind`, which exposes the data plane on a node port that `kind`'s host port-mapping forwards from `localhost`; that is what we apply. The mechanism is environment-specific — exactly the point.

### Live build

Install NGINX Gateway Fabric in three steps: the Gateway API standard-channel CRDs (the route's API types), NGF's own CRDs, then the controller in its NodePort variant for `kind`. This is the environment-specific piece — the controller that will fulfill the `Gateway` and `HTTPRoute` we write next. The refs below are pinned to `v2.6.3`, the version pinned in pre-flight; if it has moved by the day, apply the exact release tag from the pre-flight checklist rather than a moving ref.

```bash
kubectl kustomize "https://github.com/nginx/nginx-gateway-fabric/config/crd/gateway-api/standard?ref=v2.6.3" | kubectl apply -f -
kubectl apply --server-side -f https://raw.githubusercontent.com/nginx/nginx-gateway-fabric/v2.6.3/deploy/crds.yaml
kubectl apply -f https://raw.githubusercontent.com/nginx/nginx-gateway-fabric/v2.6.3/deploy/nodeport/deploy.yaml
```

```text
customresourcedefinition.apiextensions.k8s.io/gatewayclasses.gateway.networking.k8s.io created
customresourcedefinition.apiextensions.k8s.io/gateways.gateway.networking.k8s.io created
customresourcedefinition.apiextensions.k8s.io/httproutes.gateway.networking.k8s.io created
...
namespace/nginx-gateway created
deployment.apps/nginx-gateway created
service/nginx-gateway created
gatewayclass.gateway.networking.k8s.io/nginx created
...
```

The NodePort manifest is self-contained — it creates its own `nginx-gateway` namespace and the `nginx` `GatewayClass`, and generates its own internal certificates, so there is no extra controller to install and nothing to install before it. Wait for the controller to be ready before writing the `Gateway` — resources applied before the controller is up simply wait, but it is cleaner to gate on the controller.

```bash
kubectl wait --namespace nginx-gateway \
  --for=condition=Available deployment/nginx-gateway \
  --timeout=120s
```

```text
deployment.apps/nginx-gateway condition met
```

Pin the data plane to the mapped node port **and** to the control-plane node. NGF v2 provisions a data-plane Service per `Gateway` and auto-allocates its NodePort, so patch the `nginxproxy` config to pin that NodePort to `30080` — the port `kind`'s host-port mapping forwards from `localhost`. The same patch also pins the data-plane Pod to the control-plane node: the data-plane Service uses `externalTrafficPolicy: Local`, so a NodePort only answers on a node that actually runs the data-plane Pod, and `kind` maps host `30080` on the control-plane node only. The `nodeSelector` targets the built-in `node-role.kubernetes.io/control-plane` label and the matching toleration lets the Pod schedule past the control-plane `NoSchedule` taint. With both in place, the single `curl http://localhost:30080` works on both Docker Desktop and OrbStack — no port-forward and no per-runtime split.

```bash
kubectl patch nginxproxy nginx-gateway-proxy-config -n nginx-gateway --type=merge \
  -p '{"spec":{"kubernetes":{"deployment":{"pod":{"nodeSelector":{"node-role.kubernetes.io/control-plane":""},"tolerations":[{"key":"node-role.kubernetes.io/control-plane","operator":"Exists","effect":"NoSchedule"}]}},"service":{"nodePorts":[{"port":30080,"listenerPort":80}]}}}}'
```

```text
nginxproxy.gateway.nginx.org/nginx-gateway-proxy-config patched
```

Turn the app's Service from a `NodePort` into a plain `ClusterIP` — the `Gateway` fronts it now, so it no longer needs to be reachable directly from the host. Set `type: ClusterIP` **explicitly**: `kubectl apply` reconciles fields you declare, and omitting `type` would leave the live Service's existing `type: NodePort` in place rather than flipping it. Spell it out so the NodePort is actually retired.

```bash
cat > service.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: app
spec:
  type: ClusterIP
  selector:
    app: postgres
  ports:
    - port: 5432
      targetPort: 5432
---
apiVersion: v1
kind: Service
metadata:
  name: sample-app
  namespace: app
spec:
  type: ClusterIP
  selector:
    app: sample-app
  ports:
    - port: 8080
      targetPort: 8080
EOF
kubectl apply -f service.yaml
```

```text
service/postgres configured
service/sample-app configured
```

The `sample-app` Service is now `ClusterIP` — confirm the node port is gone and nothing is reachable on the host directly anymore.

```bash
kubectl get service sample-app -n app
```

```text
NAME         TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)    AGE
sample-app   ClusterIP   10.96.88.114    <none>        8080/TCP   5m
```

Write the `Gateway`: a listener on port 80 that points at the `nginx` `GatewayClass`. The `gatewayClassName` is the one environment-specific line — it selects the controller. On EKS in segment 26 this is the only field that changes.

```bash
cat > gateway.yaml <<'EOF'
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
EOF
kubectl apply -f gateway.yaml
```

```text
gateway.gateway.networking.k8s.io/sample-app created
```

Write the `HTTPRoute`: host and path routing to the app's Service, attached to the `Gateway`. This is the portable contract — it would read the same on any cluster, regardless of which controller fulfills the `Gateway` it attaches to.

```bash
cat > httproute.yaml <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: sample-app
  namespace: app
spec:
  parentRefs:
    - name: sample-app
  hostnames:
    - sample-app.local
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: sample-app
          port: 8080
EOF
kubectl apply -f httproute.yaml
```

```text
httproute.gateway.networking.k8s.io/sample-app created
```

Confirm the `Gateway` has an address and is `PROGRAMMED` — the controller has wired it up.

```bash
kubectl get gateway -n app
```

```text
NAME         CLASS   ADDRESS     PROGRAMMED   AGE
sample-app   nginx   localhost   True         20s
```

Reach the app through the `Gateway` instead of a node port. NGF's NodePort data plane is reached through `kind`'s host port-mapping, so requests to `localhost` route through the controller to the app's Service — the `HTTPRoute`'s `sample-app.local` host rule still selects the route, sent as a `Host` header. Because the patch above pins the data-plane Pod to the control-plane node whose host port is mapped, this single command works the same on both Docker Desktop and OrbStack.

```bash
curl -H "Host: sample-app.local" http://localhost:30080/healthz
```

```text
{"status":"ok"}
```

Commit the `Gateway`, the `HTTPRoute`, and the simplified Service.

```bash
git add gateway.yaml httproute.yaml service.yaml
git commit -m "Replace NodePort with NGINX Gateway Fabric, a Gateway, and an HTTPRoute"
```

```text
[stable d4e5f6a] Replace NodePort with NGINX Gateway Fabric, a Gateway, and an HTTPRoute
 3 files changed, 38 insertions(+), 5 deletions(-)
```

### Watch for

- **The `Gateway` is not `PROGRAMMED` or the `HTTPRoute` is not `Accepted`.** Check the status conditions directly: `kubectl get gateway sample-app -n app -o "jsonpath={.status.conditions}"` should show `Programmed=True`, and `kubectl get httproute sample-app -n app -o "jsonpath={.status.parents}"` should show `Accepted=True`. A `Gateway` stuck without `Programmed` usually means the controller is not running yet (`kubectl get pods -n nginx-gateway`); an `HTTPRoute` not `Accepted` usually means its `parentRefs` name does not match a `Gateway` in the same namespace.
- **`gatewayClassName` mismatch.** If the `Gateway` never gets an address, its `gatewayClassName` may not match an installed `GatewayClass`. `kubectl get gatewayclass` shows what is installed (`nginx` for NGF); the `Gateway`'s `gatewayClassName` must match one of them.
- **`404` or connection refused through the `Gateway`.** Either the `Host` header does not match the `HTTPRoute` `hostnames` rule, or the backend Service name/port is wrong. Send the exact `Host` the rule expects and check `kubectl get endpoints sample-app -n app` lists the app Pod.
- **NGF NodePort not reachable on `kind`.** If the controller is `PROGRAMMED` but `curl` to `localhost` still refuses, the node port the NGF data plane listens on may not be one `kind`'s `extraPortMappings` forwards from host :80. This is the cross-environment wiring the NodePort manifest depends on; verify the `kind` cluster config maps the host port to the NodePort the manifest uses, and adjust the cluster config if needed.
- **`localhost:30080` still refuses even when the `Gateway` is `PROGRAMMED`.** The control-plane pin in the patch above resolves the OrbStack cross-node case, so first verify the data-plane Pod actually landed on the control-plane node: `kubectl get pods -n app -o wide | grep nginx` should show it on `kind-control-plane`. If it is on a worker, the `nodeSelector`/toleration in the `nginxproxy` patch did not apply — re-apply the patch and let the data-plane Pod reschedule. Last-resort fallback (e.g. if you skipped the pin): port-forward the per-`Gateway` data-plane Service (named `<gateway>-nginx` in the `Gateway`'s namespace; find it with `kubectl get svc -A | grep nginx`): `kubectl port-forward -n app svc/sample-app-nginx 8080:80`, then `curl -H "Host: sample-app.local" localhost:8080/healthz`.
- **The published manifest refs change.** Pinning to a moving ref can drift; if any of the three apply steps fails, fall back to the exact NGF release tag you pinned in pre-flight from its releases page rather than debugging a moving target on stage.

### Transition

The app now has a real, portable front door — a `Gateway` and an `HTTPRoute` fulfilled by a controller we chose for this environment, with the NodePort retired. Stable has fixed networking, config, probes, and resource bounds. The last POC sin left is the ephemeral database, and fixing it well means meeting a new Kubernetes pattern first: the operator. The next segment teaches that pattern before we use it.

---

## Segment 12 — 3:00 — Operators & CRDs

**Stage:** Stable.
**Duration:** 30 minutes.

### Goal

Teach the operator pattern as a concept *before* using it. Install the CloudNativePG operator and show the CustomResourceDefinitions it registered, so students understand what a CRD and an operator are before they declare a `Cluster` in the next segment. No database is created here — this segment is deliberately about the pattern, not the payload. It sets up segment 13, where that pattern does the work of making Postgres durable.

### Talking points

- **A CRD extends the Kubernetes API with new kinds.** Out of the box the API knows `Deployment`, `Service`, `Pod`. A CustomResourceDefinition teaches the API server a new kind — like a CNPG `Cluster` — so `kubectl get clusters` becomes as real as `kubectl get pods`. The API is extensible by design; this is how.
- **An operator is a control loop for those new kinds.** A CRD alone is just a new shape the API will store. The operator is the controller that *watches* those custom resources and reconciles them — the same desired-state loop from Foundations, now driving Postgres clusters instead of Pods. Declaring a `Cluster` does nothing until an operator is watching for it.
- **We consume an operator; we do not write one.** The workshop installs CloudNativePG and uses it. Authoring a custom operator is explicitly out of scope — the lesson is the *pattern* and how to consume a well-built operator, not how to build a controller.
- **Install the operator first, the database second.** This segment installs the operator and inspects the CRDs it registered; segment 13 declares the `Cluster`. Splitting them keeps "what is this pattern" separate from "now use it," which is why no database exists at the end of this segment.

### Live build

Install the CloudNativePG operator from its published manifest. This registers the CRDs and starts the operator's control loop — but creates no database. The URL below is the pinned `v1.29.1` release, not a moving branch ref; if it has moved by the day, apply the exact release pinned in pre-flight.

```bash
kubectl apply --server-side -f https://github.com/cloudnative-pg/cloudnative-pg/releases/download/v1.29.1/cnpg-1.29.1.yaml
```

```text
namespace/cnpg-system created
customresourcedefinition.apiextensions.k8s.io/clusters.postgresql.cnpg.io created
customresourcedefinition.apiextensions.k8s.io/backups.postgresql.cnpg.io created
customresourcedefinition.apiextensions.k8s.io/scheduledbackups.postgresql.cnpg.io created
serviceaccount/cnpg-manager created
deployment.apps/cnpg-controller-manager created
...
```

Show the new CRDs the operator registered — these are the new API kinds that did not exist a moment ago.

```bash
kubectl get crds | grep cnpg
```

```text
backups.postgresql.cnpg.io               2024-...
clusters.postgresql.cnpg.io              2024-...
scheduledbackups.postgresql.cnpg.io      2024-...
```

Prove that `Cluster` is now a first-class kind the API understands — even though none exists yet. `kubectl get clusters` works because the CRD taught the API server about it.

```bash
kubectl get clusters -A
```

```text
No resources found
```

Confirm the operator itself is running — this is the control loop that will reconcile any `Cluster` we declare next segment.

```bash
kubectl get pods -n cnpg-system
```

```text
NAME                                       READY   STATUS    RESTARTS   AGE
cnpg-controller-manager-6d8f9c7b5-r4t2k    1/1     Running   0          40s
```

### Watch for

- **CRDs don't appear** after applying the manifest. The operator manifest failed partway — re-run with `--server-side` (large CRDs can exceed the client-side apply annotation size limit, which `--server-side` avoids). Check `kubectl get pods -n cnpg-system` for the controller's status.
- **`kubectl get clusters` errors with "the server doesn't have a resource type."** The CRD did not register — the apply did not complete. Re-apply the operator manifest and confirm the `clusters.postgresql.cnpg.io` CRD exists before moving on.
- **A student expects a database to appear.** None should — say so. This segment installs the *operator*; the `Cluster` that becomes an actual database is the next segment. The empty `kubectl get clusters` is the expected, correct state here.

### Transition

The operator is installed and watching, and `Cluster` is now a kind the API understands — but nothing has declared one yet. In the final build segment, we declare a CloudNativePG `Cluster`, the operator provisions a durable, PVC-backed Postgres for it, and we finally retire the ephemeral database POC left us with.

---

## Segment 13 — 3:30 — Durable Postgres with CloudNativePG

**Stage:** Stable.
**Duration:** 30 minutes.

### Goal

Replace the ephemeral Postgres Deployment with a durable, operator-managed database. Declare a CloudNativePG `Cluster` custom resource; the operator provisions Postgres backed by a PVC bound through a StorageClass. Prove durability by restarting the database Pod and watching the data survive — the exact failure POC demonstrated, now fixed. Reconfigure the app to talk to the CNPG-managed `-rw` Service, and continue the secrets thread: CNPG generates and owns the credentials in its auto-created `-app` Secret, so the hand-rolled segment-10 Secret is retired and no human has authored the database password.

### Talking points

- **You declare a `Cluster`; the operator does the rest.** A CNPG `Cluster` custom resource is a few lines of YAML — instance count, storage size, StorageClass. The operator reads it and provisions the Pods, the PVCs, the Services, and the credentials. This is the operator pattern from segment 12 doing real work.
- **CNPG manages Pods and PVCs much as a hand-written StatefulSet would, plus failover and backup.** This is the load-bearing talking point. Under the hood, durable Postgres needs stable Pod identity and per-Pod persistent storage — exactly what a `StatefulSet` provides. CNPG does that *and* adds automated failover, backups, and rolling upgrades. Students leave knowing the StatefulSet primitive exists and what the operator buys on top of it — the operator is not a black box hiding a mystery, it is a StatefulSet's worth of machinery plus the operational extras.
- **CNPG generates and owns the credentials.** When the operator creates the `Cluster`, it generates the database credentials and stores them in an auto-created `-app` Secret. No human authored this password; it is random per cluster. The hand-rolled Secret from segment 10 is no longer needed — the app references the CNPG `-app` Secret instead. By end of Day 1, no human has authored the production database password and nothing secret is in git.
- **The app talks to the `-rw` Service.** CNPG creates a `-rw` (read-write, points at the primary) and a `-ro` (read-only) Service, each named for the cluster. The cluster is named `postgres`, so the app connects to `postgres-rw`. The Postgres Deployment and its Service from POC/segment-8 are retired.
- **Durability is the whole point.** POC's Postgres lost its data on every Pod restart because it had no volume. CNPG binds a PVC through a StorageClass, so the data outlives the Pod. We are about to prove it the same way POC disproved it — restart the Pod and check the data.

### Live build

Delete the ephemeral Postgres Deployment and its Service — the CNPG `Cluster` replaces both.

```bash
kubectl delete -n app deployment postgres
kubectl delete -n app service postgres
```

```text
deployment.apps "postgres" deleted
service "postgres" deleted
```

Retire the file artifacts too, not just the live objects — otherwise the hand-rolled Postgres manifest lingers in git after the operator owns the database. Remove `postgres.yaml` entirely, and drop the now-dead `postgres` `ClusterIP` Service block from `service.yaml` (CNPG's `-rw`/`-ro` Services replace it). Leave the app's own Service in `service.yaml` untouched.

```bash
git rm postgres.yaml
cat > service.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: sample-app
  namespace: app
spec:
  selector:
    app: sample-app
  ports:
    - port: 8080
      targetPort: 8080
EOF
```

Declare the CloudNativePG `Cluster`. This is the entire database definition — instances, storage, and a StorageClass. The operator turns it into running Postgres.

```bash
cat > postgres-cluster.yaml <<'EOF'
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
EOF
kubectl apply -f postgres-cluster.yaml
```

```text
cluster.postgresql.cnpg.io/postgres created
```

Watch the operator provision the database. The `Cluster` reports its phase as it comes up; wait for it to reach a healthy, ready state.

```bash
kubectl get cluster postgres -n app
```

```text
NAME       AGE   INSTANCES   READY   STATUS                     PRIMARY
postgres   60s   1           1       Cluster in healthy state   postgres-1
```

Show what the operator created on your behalf — Pods and a PVC, exactly what a StatefulSet would have managed, plus the `-rw`/`-ro` Services and the `-app` Secret. Name them out loud as you point: this is the StatefulSet-equivalent the talking point described.

```bash
kubectl get pods,pvc,svc,secret -n app -l cnpg.io/cluster=postgres
```

```text
NAME             READY   STATUS    RESTARTS   AGE
pod/postgres-1   1/1     Running   0          60s

NAME                               STATUS   VOLUME    CAPACITY   STORAGECLASS   AGE
persistentvolumeclaim/postgres-1   Bound    pvc-...   1Gi        standard       60s

NAME                  TYPE        CLUSTER-IP      PORT(S)    AGE
service/postgres-rw   ClusterIP   10.96.51.20     5432/TCP   60s
service/postgres-ro   ClusterIP   10.96.51.21     5432/TCP   60s

NAME                 TYPE     DATA   AGE
secret/postgres-app  Opaque   ...    60s
```

The credentials live in the auto-created `postgres-app` Secret — generated by the operator, random per cluster, authored by no human. Reconfigure the app to read its credentials from it and to point at the `-rw` Service. The `db-config` ConfigMap still carries the non-secret config (`DB_PORT`, `DB_NAME`), so `envFrom` keeps pulling those; only `DB_HOST` changes, and the inline `env` entry sets it to `postgres-rw` — an inline `env` value wins over the same key from `envFrom`, so the ConfigMap's old `DB_HOST: postgres` is overridden without editing the ConfigMap. The hand-rolled `db-secret` from segment 10 is retired here.

```bash
cat > deployment.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sample-app
  namespace: app
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
          envFrom:
            - configMapRef:
                name: db-config
          env:
            - name: DB_HOST
              value: postgres-rw
            - name: DB_USER
              valueFrom:
                secretKeyRef:
                  name: postgres-app
                  key: username
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-app
                  key: password
          startupProbe:
            httpGet:
              path: /healthz
              port: 8080
            failureThreshold: 30
            periodSeconds: 2
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8080
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            periodSeconds: 10
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 256Mi
EOF
kubectl apply -f deployment.yaml
```

```text
deployment.apps/sample-app configured
```

Retire the now-unused hand-rolled Secret from segment 10 — CNPG owns the credentials now.

```bash
kubectl delete secret db-secret -n app
```

```text
secret "db-secret" deleted
```

Now prove durability — the exact test POC failed. Write a row through the data endpoint, then restart the database Pod and check the data survives. Hit the data endpoint once to establish a count.

```bash
curl -H "Host: sample-app.local" http://localhost:30080/counter
```

```text
{"count": 1}
```

Delete the Postgres Pod. The operator reschedules it against the same PVC — the storage outlives the Pod.

```bash
kubectl delete pod postgres-1 -n app
```

```text
pod "postgres-1" deleted
```

Once the replacement Pod is `Running`, hit the data endpoint again. The count continued instead of resetting — the data survived the restart, because it lives on the PVC, not in the Pod.

```bash
curl -H "Host: sample-app.local" http://localhost:30080/counter
```

```text
{"count": 2}
```

That is the fix. Contrast it out loud with POC, where this same test reset the counter to the start. Commit the `Cluster` manifest and the reconfigured app, and record the retirement of the hand-rolled Postgres manifest in the same commit — the `git rm` and the trimmed `service.yaml` are part of this change, not just additions.

```bash
git add postgres-cluster.yaml deployment.yaml service.yaml
git commit -m "Replace ephemeral Postgres with durable CloudNativePG Cluster"
```

```text
[stable e5f6a7b] Replace ephemeral Postgres with durable CloudNativePG Cluster
 4 files changed, 41 insertions(+), 35 deletions(-)
```

### Watch for

- **The `Cluster` is stuck not-ready.** Usually no default StorageClass, or the named StorageClass does not exist. `kubectl get storageclass` shows what is available (`kind` ships `standard` via the local-path provisioner); the `Cluster` `spec.storage.storageClass` must match one of them. `kubectl describe cluster postgres -n app` names the provisioning failure.
- **The app can't connect after switching to CNPG.** The `-rw` Service name is the cluster name plus `-rw`, so for the `postgres` cluster it is `postgres-rw` — confirm `DB_HOST` is `postgres-rw`, and that the `secretKeyRef` keys match what CNPG put in the `-app` Secret (`username` and `password`). `kubectl get secret postgres-app -n app -o jsonpath='{.data}'` shows the keys present.
- **The data didn't survive the restart.** Confirm you deleted the *Pod*, not the `Cluster` or the PVC — the PVC must stay `Bound` across the restart. `kubectl get pvc -n app` should show the same PVC bound before and after.

### Anticipated questions

**Q:** Why not just hand-write a StatefulSet for Postgres instead of installing an operator?

**A:** You could — a StatefulSet plus a headless Service and a PVC template is the manual way to express durable Postgres with stable Pod identity and per-Pod storage, and it is worth knowing that primitive exists. The operator does exactly that under the hood and adds the operational hard parts on top: automated failover when the primary dies, backups, and safe rolling upgrades. Hand-writing all of that correctly is a lot of YAML and a lot of edge cases; reaching for a well-built operator is why the pattern earns a segment. The operator is not hiding the StatefulSet — it *is* a StatefulSet's worth of machinery, managed for you.

### Transition

Postgres is now durable, operator-managed, and credentialed by CNPG itself — the last POC sin is fixed and no human authored the database password. Stable has accumulated a real pile of manifests in the process: a Deployment, a Service, a ConfigMap, a `Gateway`, an `HTTPRoute`, a `Cluster`. The final segment organizes that pile with a Kustomize base, then recaps everything the stage delivered.

---

## Segment 14 — 4:00 — Organizing Manifests with Kustomize

**Stage:** Stable.
**Duration:** 15 minutes.

### Goal

Tame the dozen manifests Stable has accumulated — a dozen *resources*, the Kubernetes objects the app is made of, not the count of files on disk — by introducing a Kustomize **base** at `k8s/base/`: a single `kustomization.yaml` that collects the manifests and is applied with `kubectl apply -k k8s/base`. This is housekeeping, not new behavior — the cluster ends in the same state, but managed as one organized unit instead of a loose pile of files. This segment is base only; overlays are a Production concern. It closes with the end-of-Stable recap.

### Talking points

- **A Kustomize base collects manifests into one applyable unit.** A `kustomization.yaml` lists the resource files that make up the application. `kubectl apply -k k8s/base` applies them together. Instead of remembering which files to apply in which order, you apply the directory.
- **No new behavior — this is organization.** Nothing about the running app changes. The value is operational: one place that names every manifest in the app, applied as a set, so the growing pile stays manageable. This is a real Stable-stage pain — a dozen loose YAML files is hard to keep straight — and the base is the fix.
- **Kustomize is built into `kubectl`.** `apply -k` is native; no extra tool to install. That is part of why the workshop chose Kustomize over Helm for manifest management.
- **Base only — overlays come later.** A *base* is the shared definition. *Overlays* patch a base with environment-specific differences (storage class, gateway class, replica count) and are a Production-stage topic, built on top of this base. We do not preview them here; today is just the base.

### Live build

Collect the loose manifests into a base directory, then write the `kustomization.yaml` there — it lists every manifest the app is made of, applied as one unit.

```bash
mkdir -p k8s/base
git mv deployment.yaml service.yaml configmap.yaml gateway.yaml httproute.yaml postgres-cluster.yaml k8s/base/
cat > k8s/base/kustomization.yaml <<'EOF'
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
EOF
```

Preview what Kustomize renders before applying — `build` prints the combined output so you can see the whole app as one document.

```bash
kubectl kustomize k8s/base
```

```text
apiVersion: v1
kind: ConfigMap
metadata:
  name: db-config
  namespace: app
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sample-app
  namespace: app
...
```

Apply the whole base with `-k`. Because the cluster already matches, this is largely a no-op confirming the base renders the same state — proving the base is a faithful collection of what is already running.

```bash
kubectl apply -k k8s/base
```

```text
configmap/db-config unchanged
service/sample-app unchanged
deployment.apps/sample-app unchanged
gateway.gateway.networking.k8s.io/sample-app unchanged
httproute.gateway.networking.k8s.io/sample-app unchanged
cluster.postgresql.cnpg.io/postgres unchanged
```

Commit the base. The app is now applyable as a single organized unit.

```bash
git add k8s/base
git commit -m "Organize Stable manifests with a Kustomize base"
```

```text
[stable f6a7b8c] Organize Stable manifests with a Kustomize base
 6 files changed, 9 insertions(+)
```

### Watch for

- **`apply -k` reports resources created, not unchanged.** A manifest is missing from the `resources` list, or a file path is wrong. The `kustomization.yaml` `resources` must list every manifest; compare against the files you committed this stage. A faithful base should be a no-op against the live cluster.
- **A student asks about overlays / per-environment values.** That is the next Kustomize beat and it belongs to Production — note it is coming and keep today base-only, so the 15-minute budget holds. Do not write an overlay on stage here.
- **Tip:** keep this segment tight. It is 15 minutes and it is housekeeping — resist the urge to teach Kustomize patches, generators, or transformers now; the base is the whole lesson.

### Transition

Stable's manifests are now one organized, version-controlled base at `k8s/base/`, applyable in a single command. That closes the Stable stage — the app has gone from the morning's imperative pile to a declarative, durable, gateway-fronted application in git. Day 2's Production stage builds on this exact base, starting with the `overlays/kind` and `overlays/eks` environment overlays (segment 27) that patch it for a real cloud cluster.

### Recap — end of Stable

Stable took the deliberately-wrong POC and fixed every sin on the list. Name each fix, then name what is still wrong — because Production is the list of those remaining fixes:

- **It is declarative and in git.** Every resource is a manifest, applied with `kubectl apply`, organized as a Kustomize base, and committed. The desired state is written down, reviewable, and recreatable — the first POC sin, fixed.
- **It is probed.** Readiness, liveness, and startup probes mean Kubernetes can tell a healthy Pod from a wedged one and restarts the wedged ones.
- **It is resource-bounded.** Requests and limits mean the scheduler places the Pod correctly and no runaway container starves the node.
- **It has a real front door.** A `Gateway` and an `HTTPRoute`, fulfilled by NGINX Gateway Fabric, replaced the crude NodePort — the route is a contract, the controller is environment-specific, and the same route is portable to a different controller on a different cluster.
- **It is durably Postgres-backed.** A CloudNativePG `Cluster` replaced the ephemeral Deployment; the data survives a Pod restart, and CNPG owns the credentials so no human authored the database password.

What is still wrong — every item is a Production segment:

- **It runs on exactly one local cluster.** `kind` on a laptop. Production migrates the same manifests to a real EKS cluster.
- **Scaling is manual.** You change a replica count by hand. Production adds a HorizontalPodAutoscaler that reacts to load.
- **A bad deploy takes the app down with no rollback discipline.** There is no safe-rollout or rollback story yet. Production adds one.
- **The workload runs under an over-permissioned default ServiceAccount.** Nothing scopes what the app can do in the cluster. Production adds RBAC and least privilege.
- **There is no story for surviving a node going away.** A lost node is an outage. Production adds PodDisruptionBudgets and the cloud-cluster machinery to ride through it.

That is Stable: the state you would hand a teammate. Production is the state you would hand an on-call rotation, and it solves every remaining item above.

### One last picture: same bricks, three builds

That first Recap line — *it runs on exactly one local cluster* — is the hook for one last mental picture before Day 2. Do not build anything here. This is a talk-over-diagram, four to six minutes, and then we close the day.

- **A Kubernetes cluster is a LEGO build.** The bricks are the component blocks you have met all stage — control plane, worker nodes, networking, storage, gateway, DNS, secrets, autoscaling, and your app. A cluster is those bricks snapped onto one baseplate. *Say it out loud: "You already own the brick set. The only question is which build you snap them into."*
- **The same brick set builds three very different clusters.** An edge device, a self-hosted cluster, and a managed cloud cluster are the same nine bricks on the same baseplate — but some bricks are swapped for a differently-shaped one that does the same job, and one brick is missing entirely. *Say it out loud: "Same resources, same app. What changes underneath is the controller, not the contract."*
- **This is the contract-versus-controller theme, assembled.** All stage you met it one resource at a time — a `Gateway` plus an `HTTPRoute` is a contract, NGINX Gateway Fabric is the controller fulfilling it. The three builds are that same idea for a whole cluster at once.

**The three builds.** Define each crisply before walking the matrix:

| Build | One-line definition | Representative form |
|---|---|---|
| **Edge / device** | A tiny cluster living on or beside a device, resource-constrained, often a single node. | k3s / k0s-style lightweight distro: control plane bundled into one process, ARM common. |
| **Self-hosted** | A cluster you stand up and operate yourself on your own machines or VMs — the "vanilla" full build. | kubeadm / bare-metal or VMs: you install and own every layer. |
| **Cloud** | A managed Kubernetes cluster where the provider runs the control plane for you. | Amazon EKS — exactly what the workshop builds on Day 2 (Production). |

**How to read a brick.** Each cell in the matrix below is one of three states:

- **P** — present, same brick: the same component, the same controller, in all builds.
- **D** — present, different-shaped brick: the same resource (the contract) fulfilled by a different controller (the implementation).
- **A** — absent / greyed out: the block is missing in that build, and the gap is the lesson.

The matrix — nine blocks down, three builds across:

| # | Block | Edge / device | Self-hosted | Cloud (EKS) |
|---|---|---|---|---|
| 1 | **Control plane** | **D** — bundled single process, co-located with the workload, often not HA (k3s packs apiserver + scheduler + controller-manager + datastore into one) | **D** — the full control plane you install and own; you run etcd, HA, upgrades | **D** — managed, highly-available EKS control plane; you never touch the masters (PRODUCTION Seg 24) |
| 2 | **Worker nodes / compute** | **D** — one or a few nodes, often the same box as the control plane; ARM common | **D** — discrete machines or VMs you provision and join | **D** — real EC2 worker nodes provisioned via an `eksctl`-managed node group (PRODUCTION Seg 24) |
| 3 | **Container networking (CNI)** *(the runtime is containerd in all three; the CNI is what varies)* | **D** — a lightweight bundled CNI for footprint (e.g. flannel) | **D** — you choose and install it (Calico / Cilium) — "you must choose" is the point | **D** — the AWS VPC CNI; Pods get real VPC IP addresses |
| 4 | **Storage (CSI / PVC)** | **D** — local-path provisioner (`standard` StorageClass), ephemeral, wiped on restart — *this is exactly what your `kind` cluster has* | **D** — a storage system you run yourself (Ceph / Longhorn / NFS) | **D** — the EBS CSI driver with a `gp3` StorageClass: dynamic, durable block volumes — no EFS (PRODUCTION Seg 25) |
| 5 | **Gateway + load balancer** | **D** — NGINX Gateway Fabric reached via host port-mapping; **no real external load balancer** (on `kind`, the `Gateway` ADDRESS shows `localhost`) — *this is exactly what your `kind` cluster has* | **D** — a Gateway API implementation (NGINX Gateway Fabric / Envoy Gateway) plus a self-managed LB (MetalLB) to stand in for a cloud LB | **D** — the AWS Load Balancer Controller provisions a real ALB that fulfills the **same** `Gateway` and `HTTPRoute` (PRODUCTION Seg 26) |
| 6 | **DNS (CoreDNS)** | **P** — CoreDNS | **P** — CoreDNS | **P** — CoreDNS *(anchor brick — in-cluster service discovery is CoreDNS in all three; cloud DNS for external names is additionally available but the workshop does not wire it)* |
| 7 | **Secrets / credentials** *(the Secret object is the same brick everywhere; the lock behind it differs)* | **D** — Secret object present; encryption-at-rest often off by default | **D** — Secret object present; you wire etcd encryption / KMS yourself | **D** — Secret object present; EKS envelope-encrypts Secrets at rest by default on 1.28+ (AWS-owned KMS key; customer key is opt-in); SealedSecrets sealed per-cluster (PRODUCTION Seg 23) |
| 8 | **Autoscaling (pod-level HPA)** | **A** — no metrics-server by default, so no HPA — *this is where your `kind` cluster starts* | **D** — HPA works *if* you install metrics-server | **P** — HPA backed by metrics-server, exactly as the workshop teaches it (PRODUCTION Seg 17); node autoscaling (Cluster Autoscaler / Karpenter) is never taught — out of scope |
| 9 | **Application + database (Node API + CNPG)** | **P** — same Deployment + CNPG | **P** — same Deployment + CNPG | **P** — same Deployment + CNPG *(anchor brick — same in all three; plugs into whatever storage brick #4 provides)* |

**Reading the matrix — talking points:**

Do not read the matrix cell by cell. Point at it, then talk these five points — the cells are reference for later.

- **Your `kind` cluster lives near the EDGE / local end of this picture — not the cloud end.** What students built in Stable is a non-HA control plane (a single control-plane node, plus two workers), local-path `standard` storage, NGINX Gateway Fabric with no real external load balancer, and no autoscaling. Read down the edge column and you are largely reading your own cluster. *Say it out loud so nobody mistakes `kind` for the cloud build: "The cluster on your laptop is the left-hand column. Day 2 is the journey to the right-hand one."*
- **The two all-P rows (6 and 9) are your anchors** — point them out first so the variation below them reads as variation around a stable core. If a reader feels lost in the variation, the anchors are the "you are here."
- **Rows 3, 4, 5, 7 are all-D and that is the whole lesson** — same resource, three different controllers. Each cell names the concrete controller on purpose; do not abstract them away. An all-D row is not inconsistency — it is the contract-versus-controller theme made literal.
- **Row 8 is the "absence" row** — and a tie-in: the workshop's own `kind` cluster *starts* at "A" for the HPA and only *earns* "P" in PRODUCTION Segment 17, where you install metrics-server because `kind` ships none. The matrix's edge column is where every student's cluster began this morning.
- **Rows 1 and 2 are all-D too** — control plane and worker nodes take a *different form* in every build (bundled at the edge, self-operated when you host it, managed on EKS); there is no single "baseline" form even in the self-hosted column.

> **Node autoscaling is deliberately out of this matrix.** The workshop teaches only **pod-level** autoscaling (the HPA, PRODUCTION Seg 17). Cluster Autoscaler and Karpenter are never taught and are intentionally absent from every column — row 8 is HPA only, end to end, so the matrix matches what Day 2 actually delivers.

> These three clusters are a thought experiment, not a lab. The workshop builds exactly two clusters — the local `kind` cluster you have now, and the EKS cluster in Day 2. If someone asks to build the edge or self-hosted version on stage, decline: the point of this picture is to *read* the differences, not to assemble them. The cloud column is a forward reference to the Production segments, not material for today.

**The three builds, drawn.** Each illustration is the same nine-slot baseplate with the same brick positions; only the brick in each slot changes. The captions stand on their own if the images are not yet rendered.

![Edge build: a LEGO baseplate with nine labeled slots representing one Kubernetes cluster built for an edge device. Control plane and worker-node bricks are small and fused together; the storage, networking, gateway, and secrets bricks are present but differently shaped; the DNS and application bricks are full-size and marked as anchors identical across all three builds; the autoscaling slot is an empty grey ghost brick indicating it is absent.](img/diagrams/lego-edge-cluster.svg)

*Edge build: the same app on the smallest possible cluster — and the closest match to the `kind` cluster on your laptop. The control plane and nodes collapse toward one box, storage is ephemeral, and there is no HPA brick at all (no metrics-server to feed it).*

![Self-hosted build: the same nine-slot LEGO baseplate built as a self-hosted Kubernetes cluster. Control plane, worker nodes, networking, storage, gateway, secrets, and autoscaling bricks are present but differently shaped to show controllers the operator installs themselves; DNS and application bricks are marked as anchors identical across all three builds.](img/diagrams/lego-selfhosted-cluster.svg)

*Self-hosted build: the vanilla, you-own-everything cluster. Every controller behind a resource is one you installed yourself — control plane, nodes, networking, storage, and the rest are all a different form from the edge and cloud builds.*

![Cloud build (EKS): the same nine-slot LEGO baseplate built as a managed cloud Kubernetes cluster on EKS. The control plane is drawn as a sealed managed brick; worker-node, networking, storage, gateway, and secrets bricks are differently shaped and tinted to show cloud-provider controllers; the pod-level autoscaling (HPA) brick is full-size and solid; DNS and application bricks are marked as anchors identical across all three builds.](img/diagrams/lego-cloud-cluster.svg)

*Cloud build (EKS): the control plane becomes a sealed brick you never open, and the HPA — pod-level autoscaling — is finally a solid brick. This is the only one of the three the workshop actually builds, on Day 2.*

**Bridge to Day 2.** The cloud column is the only build the workshop assembles for real — that is the whole Production stage, migrating these exact manifests onto a managed EKS cluster where the sealed control-plane brick and the solid HPA brick finally snap into place.
