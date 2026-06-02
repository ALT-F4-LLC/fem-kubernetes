# POC — Instructor Guide

This is the **POC** stage of the workshop — OUTLINE segments 4-6, the Day-1 mid-morning block (10:30-12:00) that immediately follows Foundations. By the end of this stage the sample app and an ephemeral Postgres both run on the local `kind` cluster, wired together and reachable from the host — built **entirely with imperative `kubectl` commands**. This is the deliberately-wrong "before" picture: it works, and almost everything about how it was built is something Stable will have to fix.

**Stage at a glance.**
- **Delivers:** the sample app plus an ephemeral Postgres running on `kind`, built entirely with imperative `kubectl` commands.
- **End state:** a working but deliberately-wrong stack — nothing in git, data ephemeral, the password in plaintext.
- **Next:** Stable turns every wrong choice into the right one — declarative manifests, durable storage, a real Secret.

**How to read this guide.** Each segment below follows the same fixed section order — Goal, Talking points, Live build, Watch for, then (optionally) Anticipated questions, then Transition — so your eye lands in the same place every time. The fenced command blocks are exactly what you type on stage; one logical step per block, with prose between blocks narrating the build. Output blocks are **representative** — they show the shape and the teaching signal a command produces, not a literal capture, so pod-name suffixes, ages, and IPs will differ on your machine. Every secret value shown is **deliberately fake**.

> **Scope guard — keep these in mind on stage.**
>
> **Stage design choices that bind POC (enforce these):**
> - **Imperative only.** Every build step in this stage is an imperative `kubectl` command — `run`, `create deployment`, `scale`, `expose`, `create service`. Do **not** write or preview a YAML manifest, and do **not** run `kubectl apply`. The imperative-to-declarative pivot is segment 8; previewing a manifest here steals that segment's payoff.
> - **Ephemeral Postgres.** Postgres enters in segment 5 as a second Deployment with **no volume** — its data is deliberately ephemeral and dies on pod restart. Do not give it a PersistentVolumeClaim; durable Postgres is segment 13 (CloudNativePG).
> - **The password is wrong on purpose.** In segment 6 the Postgres password is a plaintext literal passed on a `kubectl` command line. Name it as wrong out loud — it lands in shell history and on the permanent screenshare. Use an obviously-fake demo value (`demo-not-a-real-password`); never type a real-looking secret.
>
> **Explicitly out of scope for the whole workshop (decline on stage without improvising):**
> - **No Helm.** Kustomize is the only manifest-management tool taught — and it does not appear until Stable.
> - **No hand-written StatefulSet** for Postgres. Durability is the CloudNativePG operator (Stable, segment 13).
> - **No in-cluster observability stacks** (Prometheus, Grafana, Loki, LGTM). Only built-in signals (`kubectl get`, `describe`, `logs`, events) and, later, platform-provided observability.
> - **No service mesh** (Istio, Linkerd, Cilium service mesh).
> - **No authoring a custom operator** — the workshop consumes CloudNativePG later; it never writes a controller.
> - **No multi-cluster operation** — one cluster at a time. POC runs entirely on the single `kind` cluster built in Foundations.

---

## Segment 4 — 10:30 — Pods: Running the Sample App

**Stage:** POC.
**Duration:** 30 minutes.

### Goal

Get the very first thing onto the cluster Foundations just built. You run the sample app as a single bare Pod with imperative `kubectl run`, explore it from every angle a Pod can be explored (`get`, `describe`, `logs`, `exec`), and then **delete it** — and show that nothing brings it back. That deliberate deletion is the whole point of the segment: a bare Pod has no one watching it, so its disappearance is permanent. That gap is what motivates the Deployment in segment 5.

### Talking points

- A **Pod** is the smallest thing Kubernetes runs: one (or a few tightly-coupled) containers sharing a network identity. When we say "run a container on Kubernetes," the unit on the cluster is a Pod.
- `kubectl run` is the most direct way to get a Pod going — no YAML, no abstraction. It is how you *explore*, not how you *operate*. We lean into that here because the whole POC is about exploring imperatively.
- The four verbs you reach for constantly: `get` (does it exist, what state), `describe` (why is it in that state — events at the bottom are gold), `logs` (what is the app itself saying), `exec` (get a shell inside and poke around).
- The payoff line, say it before you delete: *"This Pod is running because I told it to run, once. Nobody is watching it. Watch what happens when it goes away."* Then delete it and let the silence land — nothing reschedules it.

### Live build

Run the sample app as a single bare Pod. The image is the published sample-app image from the pre-flight checklist, pinned to `:v1`.

```bash
kubectl run sample-app --image=docker.io/altf4llc/fem-kubernetes:v1 --port=8080
```

```
pod/sample-app created
```

Confirm it is scheduled and coming up. Run `get` once immediately, then again a few seconds later so students see `ContainerCreating` settle to `Running`.

```bash
kubectl get pods
```

```
NAME         READY   STATUS    RESTARTS   AGE
sample-app   1/1     Running   0          12s
```

Show where it landed and the lifecycle events. Scroll to the bottom of `describe` — the `Events` block is the first place you look when a Pod misbehaves.

```bash
kubectl describe pod sample-app
```

```
Name:         sample-app
Namespace:    default
Node:         kind-worker/172.18.0.3
Status:       Running
IP:           10.244.1.7
Containers:
  sample-app:
    Image:          docker.io/altf4llc/fem-kubernetes:v1
    Port:           8080/TCP
    State:          Running
Events:
  Type    Reason     Age   From               Message
  ----    ------     ----  ----               -------
  Normal  Scheduled  20s   default-scheduler  Successfully assigned default/sample-app to kind-worker
  Normal  Pulled     18s   kubelet            Container image already present on machine
  Normal  Created    18s   kubelet            Created container sample-app
  Normal  Started    17s   kubelet            Started container sample-app
```

Read the app's own output. The startup line tells you the process is alive and listening.

```bash
kubectl logs sample-app
```

```
listening on :8080
GET /healthz 200
```

Get a shell inside the running container and hit the health endpoint from within the Pod's own network namespace. This proves the app is serving on its port before any networking exists around it.

```bash
kubectl exec -it sample-app -- sh
```

```
/app # wget -qO- localhost:8080/healthz
ok
/app # exit
```

Now the payoff. Delete the Pod, then immediately list Pods again — and there is nothing there. No controller recreated it, because nothing was ever watching it.

```bash
kubectl delete pod sample-app
```

```
pod "sample-app" deleted
```

```bash
kubectl get pods
```

```
No resources found in default namespace.
```

Let that sit for a beat. The app you were just shelled into is simply gone, and waiting will not bring it back.

### Watch for

- **Image won't pull** (`ErrImagePull` / `ImagePullBackOff` in `get pods`). The registry, image, or tag is wrong, or the image is private. This is exactly the pre-flight checklist item about a public, pinned image — if it bites here, do not debug the registry live; point students at the pre-flight checklist and the committed manifests at `manifests/day-one/` and move on.
- **`exec` fails with "cannot exec in a container that has terminated"** — the Pod crashed after starting. Check `kubectl logs sample-app` (or `kubectl logs sample-app --previous`) for the crash, and `describe` for the restart count and reason.
- **A student asks "where did it go?"** — that *is* the lesson. Resist the urge to recreate it to make them feel better; the absence is the motivation for segment 5.

### Anticipated questions

**Q:** Why didn't the Pod come back after I deleted it, like things usually do in Kubernetes?
**A:** Because a bare Pod is the one thing nothing is watching. The self-healing you've heard about comes from a *controller* — a Deployment, in the next segment — whose job is to notice a missing Pod and recreate it. A Pod created directly with `kubectl run` has no controller above it, so when it's gone, it's gone. That gap is exactly why we never run bare Pods for real, and exactly what segment 5 fixes.

**Q:** What's the difference between a Pod and a container?
**A:** A container is the running image — one process tree, one filesystem. A Pod is the smallest thing *Kubernetes* schedules: a wrapper around one (or a few tightly-coupled) containers that share a network identity and can share storage. Almost always it's one container per Pod; the Pod is the unit Kubernetes places on a node and gives an IP.

**Q:** Why are we using `kubectl run` instead of writing a YAML file?
**A:** On purpose — the whole POC stage is the imperative, explore-by-command way of working. `kubectl run` is the fastest way to get a Pod onto the cluster and poke at it. It's how you *explore*, not how you *operate*. The pivot to declarative YAML you commit to git is a deliberate later payoff (segment 8), so we're holding it back to make that switch land.

### Transition

A bare Pod runs until it doesn't, and then it is gone for good — no one is reconciling it back. In the next segment we hand that responsibility to a **Deployment**, the controller whose entire job is to keep a Pod running, and we watch it heal damage we cause on purpose.

---

## Segment 5 — 11:00 — Deployments & Self-Healing

**Stage:** POC.
**Duration:** 30 minutes.

### Goal

Replace the disposable bare Pod with a **Deployment** — a controller that continuously drives the cluster toward a desired number of running replicas — and make self-healing visible by deleting a Pod out from under it and watching it come back. Then bring the database tier online as a **second Deployment running Postgres with no volume** (deliberately ephemeral), so both halves of the app are running. Everything still happens through imperative commands.

### Talking points

- This is the control-loop idea from Foundations made concrete. A Deployment is the cruise control: you declare "I want N of these running," and the controller never stops nudging the actual count toward N. Delete a Pod and reconciliation puts it right back — that is **self-healing**, and it is the single biggest reason to never run bare Pods in anything real.
- A Deployment doesn't manage Pods directly; it owns a **ReplicaSet**, and the ReplicaSet is what actually keeps the replica count correct. You'll see the ReplicaSet's hash in the Pod names (`sample-app-<replicaset-hash>-<pod-hash>`).
- **Scaling is one flag.** `kubectl scale` changes the desired count and the controller reconciles to it — no editing, no redeploy.
- Postgres is **deliberately ephemeral here.** We give it no storage, so its data lives only in the container's filesystem and dies the instant the Pod restarts. Say plainly: *"This is wrong, and we are leaving it wrong on purpose — durable Postgres is a whole segment later."* The broken-ness is the teaching tool.

### Live build

Recreate the app, this time as a Deployment instead of a bare Pod. The Deployment is the thing that will watch the Pod for us.

```bash
kubectl create deployment sample-app --image=docker.io/altf4llc/fem-kubernetes:v1
```

```
deployment.apps/sample-app created
```

List Pods and note the generated name — the Deployment created a ReplicaSet, which created the Pod. The two hash segments in the name are that lineage.

```bash
kubectl get deployments,pods
```

```
NAME                         READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/sample-app   1/1     1            1           8s

NAME                          READY   STATUS    RESTARTS   AGE
pod/sample-app-7d9c4b5f8-2xq4r  1/1     Running   0          8s
```

Now the self-healing demonstration. Start a watch on Pods in one pane so the class can see the change happen live.

```bash
kubectl get pods --watch
```

In a second pane (or after stopping the watch), delete the running Pod by name — copy the exact name from the watch output.

```bash
kubectl delete pod sample-app-7d9c4b5f8-2xq4r
```

```
pod "sample-app-7d9c4b5f8-2xq4r" deleted
```

Back on the watch, a replacement Pod appears almost immediately — a new name, because it is a new Pod, but the desired count of 1 is restored without you doing anything.

```
NAME                          READY   STATUS        RESTARTS   AGE
sample-app-7d9c4b5f8-2xq4r    1/1     Terminating   0          45s
sample-app-7d9c4b5f8-9fk2p    0/1     ContainerCreating   0    1s
sample-app-7d9c4b5f8-9fk2p    1/1     Running       0          4s
```

That is the loop. Contrast it out loud with segment 4: the bare Pod stayed gone; this one heals.

Scale up to see the count obeyed, then back down. Watch the replica count settle each time.

```bash
kubectl scale deployment sample-app --replicas=3
```

```
deployment.apps/sample-app scaled
```

```bash
kubectl get pods
```

```
NAME                          READY   STATUS    RESTARTS   AGE
sample-app-7d9c4b5f8-9fk2p    1/1     Running   0          90s
sample-app-7d9c4b5f8-l4m7d    1/1     Running   0          11s
sample-app-7d9c4b5f8-qz8wt    1/1     Running   0          11s
```

Scale back to one before moving on — POC keeps it small.

```bash
kubectl scale deployment sample-app --replicas=1
```

```
deployment.apps/sample-app scaled
```

Now bring up Postgres as a second Deployment. It needs a password to initialize; we pass one as an environment variable on the command line. We will revisit *how wrong that is* in segment 6 — for now, get it running. Note there is **no volume**: this Postgres is intentionally ephemeral.

```bash
kubectl create deployment postgres --image=postgres:16
```

```
deployment.apps/postgres created
```

The Postgres image refuses to start without a password configured, so set it via `kubectl set env` — along with `POSTGRES_DB=appdb`, the database the app expects to connect to (without it the app can't reach its database and returns 503s). (We are deferring the "this is a bad way to handle a secret" conversation to segment 6 on purpose — flag it and move on.)

```bash
kubectl set env deployment/postgres POSTGRES_PASSWORD=demo-not-a-real-password POSTGRES_DB=appdb
```

```
deployment.apps/postgres env updated
```

Confirm both tiers are now running.

```bash
kubectl get deployments,pods
```

```
NAME                         READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/postgres     1/1     1            1           20s
deployment.apps/sample-app   1/1     1            1           4m

NAME                            READY   STATUS    RESTARTS   AGE
pod/postgres-6b8c9d7f5-mn2kq    1/1     Running   0          20s
pod/sample-app-7d9c4b5f8-9fk2p  1/1     Running   0          4m
```

Both halves of the app are up. They cannot talk to each other yet — Pod IPs churn and there is no stable name — which is exactly what segment 6 fixes.

### Watch for

- **Postgres Pod in `CrashLoopBackOff`** right after creation — almost always the password env var was not set before the container tried to initialize. Check `kubectl logs deployment/postgres`; the message names the missing `POSTGRES_PASSWORD`. Re-running `kubectl set env` rolls the Pod and it comes up clean.
- **The deleted Pod doesn't seem to come back** — you are looking at the wrong namespace or the watch scrolled past it. `kubectl get pods` (no watch) shows the current truth; the replacement has a different name-hash than the one you deleted.
- **Scaling "doesn't work"** — confirm you scaled the Deployment (`kubectl scale deployment sample-app`), not a Pod. You cannot scale a bare Pod; that is the whole reason we moved to a Deployment.

### Transition

Two Deployments are now running and self-healing, but they are islands: the app has no stable address for Postgres, and nothing outside the cluster can reach the app. In the final POC segment we add **Services** — a `ClusterIP` so the app can find Postgres by name, and a `NodePort` so the host can reach the app — and then take stock of everything we built the wrong way.

---

## Segment 6 — 11:30 — Services & Wiring the App to Postgres

**Stage:** POC.
**Duration:** 30 minutes.

### Goal

Give the two Deployments stable addresses so they form a working stack, and reach the app from the host. Pod IPs change every time a Pod is replaced (you just watched that happen in segment 5), so you create a **`ClusterIP` Service** for Postgres — a stable in-cluster DNS name the app resolves — and a **`NodePort` Service** for the app, so it is reachable from the laptop. The full app-plus-database stack now runs on `kind`. Then close the POC with a recap that names, deliberately, everything that is still wrong.

### Talking points

- **The problem Services solve:** a Pod's IP is ephemeral and changes on every reschedule. A Service is a stable virtual IP and DNS name in front of a set of Pods (selected by label) — the address stays put while the Pods behind it churn.
- **`ClusterIP`** is the default: reachable only from inside the cluster. Perfect for Postgres, which only the app needs to talk to. The app connects to it by the Service's DNS name (`postgres`), not by any Pod IP.
- **`NodePort`** opens a port on every node so something outside the cluster can reach the Service. We use it for the app because it is the most direct way to hit the app from the host on `kind` — and, like everything in POC, it is the crude option we will replace later (with a real front door — a `Gateway` — in Stable).
- **The secret is wrong — say it out loud.** When we wire the app to Postgres we pass the database password as a plaintext literal on the `kubectl` command line. State it plainly: *"This password is now in my shell history and on this recording forever. This is exactly how you should not handle a secret."* And it is worse than the terminal: once it is set on the Deployment, anyone with cluster access can read it back with `kubectl get deployment sample-app -o yaml` — the plaintext lives in the Deployment object itself, so a private terminal does not make it safe. The value (`demo-not-a-real-password`) is deliberately fake precisely because the screenshare is permanent. This is the first beat of the secrets thread that Stable and Production pay off.

### Live build

Give Postgres a stable in-cluster address. A `ClusterIP` Service named `postgres` lets the app reach the database by DNS, regardless of which Pod (and IP) is currently backing it.

```bash
kubectl expose deployment postgres --port=5432 --name=postgres
```

```
service/postgres exposed
```

Confirm it has a stable cluster IP. The app will use the name `postgres`, not this IP — but seeing the IP makes the "stable address" point concrete.

```bash
kubectl get service postgres
```

```
NAME       TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)    AGE
postgres   ClusterIP   10.96.142.30    <none>        5432/TCP   6s
```

Now wire the app to Postgres. The app reads its database connection from environment variables; set them on the app Deployment, pointing at the `postgres` Service name. **This is the deliberately-wrong secret moment** — the password goes in as a plaintext literal. Narrate that it is landing in shell history and on the recording as you type it.

```bash
kubectl set env deployment/sample-app DB_HOST=postgres DB_PASSWORD=demo-not-a-real-password
```

```
deployment.apps/sample-app env updated
```

Setting the env rolls the app Pod; once it is back, expose the app to the host with a `NodePort` Service.

```bash
kubectl expose deployment sample-app --type=NodePort --port=8080 --name=sample-app
```

```
service/sample-app exposed
```

Find the node port Kubernetes assigned — it is in the high `30000-32767` range.

```bash
kubectl get service sample-app
```

```
NAME         TYPE       CLUSTER-IP     EXTERNAL-IP   PORT(S)          AGE
sample-app   NodePort   10.96.88.114   <none>        8080:31480/TCP   5s
```

Reach the app from the host through the node port. On `kind` the node is a container, so forward the port (or use the mapped port if your `kind` config maps it). The simplest reliable path on stage is a port-forward to the Service:

```bash
kubectl port-forward service/sample-app 8080:8080
```

```
Forwarding from 127.0.0.1:8080 -> 8080
```

In a browser or a second terminal, hit the health endpoint and then the data endpoint — `/counter` reads and writes a row in Postgres, proving the full stack is wired.

```bash
curl localhost:8080/healthz
```

```
ok
```

```bash
curl localhost:8080/counter
```

```
{"count": 1}
```

The app served a request that went all the way to Postgres and back. The full POC stack is live on `kind`. Hit the data endpoint a few more times and watch the count climb — every request writes a row, so the number going up is proof the data is genuinely landing in Postgres.

```bash
curl localhost:8080/counter
```

```
{"count": 5}
```

Now prove the database is ephemeral — this sets up the recap. Delete the Postgres Pod, let the Deployment heal it, then hit the data endpoint again: the count drops all the way back to the start, because the data lived only in the container that just died.

```bash
kubectl delete pod -l app=postgres
```

```
pod "postgres-6b8c9d7f5-mn2kq" deleted
```

```bash
curl localhost:8080/counter
```

```
{"count": 1}
```

The counter is back at the start. The data did not survive the restart — by design, because we gave Postgres no volume.

### Watch for

- **App can't reach Postgres** (the data endpoint errors, logs show a connection refused/DNS failure). Confirm the Service is named exactly `postgres` and the app's `DB_HOST` matches that name — in-cluster DNS resolves the Service name, so a typo in either breaks the wiring. `kubectl get endpoints postgres` should list the Postgres Pod IP; an empty endpoints list means the Service selector isn't matching the Pod's labels.
- **`NodePort` not reachable from the host on `kind`** — a raw `NodePort` requires the port to be mapped in the `kind` config, which it may not be. The `kubectl port-forward` shown above sidesteps that entirely and is the reliable on-stage path; prefer it if the node port doesn't answer.
- **Port-forward dies** when you Ctrl-C it or the Pod rolls — that is expected; just re-run the `port-forward` command. It is a foreground process tied to the current Pod.

### Transition

The full application is running on the cluster: app and database, wired together, reachable from the host — and built start to finish with nothing but imperative `kubectl` commands. That is genuinely an accomplishment, and it is also the high-water mark of doing it the wrong way. Before lunch, take stock of *how* wrong, because the entire Stable stage is the list of fixes.

### Recap — end of POC

We have a working deployment — and a catalogue of problems we built in on purpose. Name each one; each is something Stable will solve:

- **Nothing is in git.** Every resource exists only because of a command someone typed. There is no record of the desired state, no way to review a change, no way to recreate this from scratch except by retyping the whole morning. Stable rewrites all of it as declarative manifests committed to git.
- **NodePort access.** The app is reachable only through a raw node port (or a manual port-forward) — crude and not how you expose a real app. Stable replaces it with a real front door — a `Gateway` and an `HTTPRoute`.
- **No health probes.** Kubernetes has no way to tell a healthy Pod from a wedged one; a hung app keeps receiving traffic. Stable adds readiness, liveness, and startup probes.
- **No resource limits.** Nothing bounds what these Pods can consume; one runaway container can starve the node. Stable adds resource requests and limits.
- **The database is ephemeral.** We just watched the data vanish on a pod restart, because Postgres has no volume. Stable gives it durable, PVC-backed storage via the CloudNativePG operator.
- **The secret is exposed.** The Postgres password went in as a plaintext literal on the command line — now in shell history and on this permanent recording. Stable moves it into a Secret object (and Production makes it git-safe).

That is the POC: the deliberately-wrong "before" picture. After lunch, Stable turns every one of these into a fix.
