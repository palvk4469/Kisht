# Engineering log

A dated record of decisions, trade-offs and problems found along the way. Formal decisions are in [DECISIONS.md](DECISIONS.md) and assumptions in [ASSUMPTIONS.md](ASSUMPTIONS.md).

## Phase 0: foundations (2026-11-02)

- **Why brief 4.** Its hard parts are about correctness under real constraints: offline sync, and RBI's 8 am–7 pm contact rule enforced even when the phone is offline or its clock is wrong. The "AI" can be a real, explainable model rather than a wrapper. And the value ties to the client's own numbers: one roll costs 0.20 × 0.35 × outstanding = ₹35k on a ₹5 lakh loan.
- **Ranking by expected loss, not raw probability.** P(roll) × outstanding × 0.07 (A10) puts a ₹6.4 lakh loan at 12 DPD ahead of a ₹50k loan at 27 DPD when that is where the money is. I'll be ready to defend the trade-off: small loans close to rolling still surface through the "days to roll" reason.
- **Separate Fastify API behind a Next rewrite (D3, D4).** Cookies stay first-party, there's no CORS, and the sync and import endpoints are plain HTTP handlers that tests call directly with `app.inject`.
- **Shared pure package (D1).** The contact-window and scoring code is the same on phone and server, so the button the officer sees greyed out is exactly what the server would reject.
- **Version pins (D12).** Prisma 7 (8 is still an RC), Better Auth's new `auth` CLI, and TS 6 rather than 7.
- **Hit during setup.** Port 5432 was taken by a local Postgres, so the container maps to 5433. pnpm 12 needs builds approved explicitly (`allowBuilds`). Prisma's generate step moved to the root `postinstall` because the package-level hook ran before the CLI was linked. `next dev` hit the machine's inotify instance limit, which is a local environment issue, documented in the README.

### Review pass, same day

- **Found an off-by-one in date storage.** Prisma writes only the UTC date part of a JS `Date` into a `DATE` column. IST midnight is 18:30 UTC the day before, so 2026-11-02 IST was stored as 2026-11-01. That would have flagged promises as broken a day early and shifted every roll-rate cohort. I confirmed it against Postgres, then made days `YYYY-MM-DD` strings that pass through `toDbDate`/`fromDbDate` in `@kisht/shared`, with regression tests.
- **The database now enforces two business rules, not just the app.** Partial unique indexes allow one current assignment per loan (`endedAt IS NULL`) and one pending promise per loan. These use Prisma 7's `partialIndexes` preview, so Prisma knows about the indexes and won't drop them in a later migration. Integration tests prove that duplicates are rejected.
- **Test safety.** The test database client refuses any database whose name doesn't contain "test", so a wrong `.env` can't wipe dev data.
- **Reviewer path.** `pnpm db:migrate` now runs `migrate deploy` (it applies committed migrations and never prompts). `db:migrate:dev` is for writing new migrations. `db:migrate:test` targets the test database.
- **Biome** checks lint and formatting in CI.
- **Noted for auth (day 2).** Better Auth lets anyone sign up and set extra user fields by default, so a self-registered user could choose `role: BRANCH_MANAGER`. Public sign-up will be off, and `role`/`branchId` won't be accepted as user input, with a test.

## Day 2: auth, seed data and the daily import (2026-11-02)

- **Auth.** Better Auth with sign-up disabled, and `role`/`branchId`/`locale` marked `input: false`. Tests show self-registration fails with `EMAIL_PASSWORD_SIGN_UP_DISABLED` and a role change fails with `FIELD_NOT_ALLOWED`, while a plain name change still succeeds, so the rejection is specific. Sessions last 30 days so an officer who is offline for days doesn't lose their outbox.
- **A test that proved nothing, caught.** The first sign-up test used a `@test.local` address. Better Auth rejected it as an invalid email, so the test passed for the wrong reason. Probing the real responses showed this, and the test now uses a valid address and asserts the specific error code.
- **Found that Better Auth turns off its Origin/CSRF checks when `NODE_ENV=test`.** Our tests were running a weaker configuration than production, and a POST from `https://evil.example` with a valid cookie succeeded. Fixed by forcing `disableOriginCheck: false`, plus our own Origin guard on every state-changing `/api` route (requests with no Origin are rejected too). Both are covered by tests.
- **One access rule.** `loanScope(user)` is AND-ed into every loan query. Officers see loans currently assigned to them (they lose access on reassignment), managers see their branch, the head sees everything. Out of scope returns 404, never 403, so loan IDs can't be probed. Borrower phones are masked, and each reveal writes an audit row (DPDP).
- **Assignment: the cap goes on the list, not on ownership.** The plan first said "capacity 25 per officer". Applied to ownership, that would leave overdue loans without an owner on a heavy day. Now a loan stays with its current officer while they cover its pincode, otherwise it goes to the least-loaded covering officer, and the 25 cap applies only to the day's list. Uncovered pincodes (452020 in the seed) go to the manager's queue.
- **Seed as a simulation, not random rows.** Each loan has a hidden risk that drives missed EMIs, payment speed, reachability and promise-keeping. Officers in the simulation work oldest-overdue-first, which is today's practice and the baseline the priority model has to beat. I calibrated it to the brief: roll rate 1–30 → 31+ is **23.1%** (brief: 22%), and 29% of promises are kept. `pnpm --filter @kisht/db sim:stats` prints the numbers. The brief's three sample rows come out exactly, including LN-11930's promise from 31 Oct being broken as of 2 Nov after the one-day grace.
- **Import: preview, then commit.** Preview validates and plans (payments found, cures, new loans, assignment changes) without writing any loan data. Commit claims the batch with a conditional update before doing anything, so a double submit can't apply twice. It then re-plans inside a single transaction, because the database may have changed since the preview. The CSV parser handles what Indian bank exports actually contain: BOM, CRLF, `₹6,40,000`, `+91` phones, `05/11/2026`. One bad row is reported with its Excel row number and never blocks the rest.
- **Local environment.** This machine's inotify limit also breaks `tsx watch`, so `pnpm --filter @kisht/api start` (no watcher) is the fallback, and it now loads `.env`.

### Day 2, continued: the first screens (2026-11-03)

- **Web foundation.** Design tokens in Tailwind v4 `@theme`: one ink-indigo accent, and red/amber/green reserved for meaning. Noto Sans plus Noto Sans Devanagari, tabular figures for money, 48px tap targets. Shared loading, empty and error states, so every screen handles them the same way. Hindi is the default; the language toggle is on every screen.
- **Sign-in.** One-tap demo accounts (officer, manager, head) appear only in demo mode. Officers are routed to `/today`, managers to the import screen; an officer who types a manager URL is sent home. The API enforces access regardless (D14).
- **Import screen (screen 5).** Choose a day and a file, see what the file will change, then commit. The preview shows rows ready, rows with errors (with Excel row numbers), new loans, cures, payments, assignment changes, each officer's load, and a warning when the upload replaces an earlier one for the same day. In demo mode it offers a generated sample export with deliberate changes, so a reviewer sees every path in one upload.
- **Caught by looking at the screenshots, not by tests:**
  - Tailwind v4 changed the arbitrary CSS-variable syntax, so `rounded-[--radius-card]` silently did nothing and cards had square corners. A theme token is now its own utility (`rounded-card`).
  - The demo buttons were missing from the build. `@next/env` caches the env it loads first (from `apps/web`), so loading the root `.env` from `next.config.ts` was a no-op until called with `forceReload`.
  - On phones the import history scrolled sideways and cut off the status column. Phones now get a stacked list, and the list shows the last 7 with "show all".
  - `text-rendering: optimizeLegibility` was removed: it mis-spaces Noto at small sizes and costs layout time on low-end phones.
- **Turbopack and NodeNext.** Next couldn't resolve `./dates.js`-style imports inside the shared package, which are correct for tsc's NodeNext mode. `@kisht/shared` now uses explicit `.ts` specifiers with `allowImportingTsExtensions`: the one form tsc, tsx, Vitest and Turbopack all accept.
- **End-to-end tests (Playwright, phone and desktop):** signed-out redirect, officer routing, the full preview → commit flow on the sample export, and the wrong-password message. They run with one worker because the projects share a database, and two parallel imports did race in the first run.

## Day 3 morning: architecture hardening (2026-11-03)

After two days of shipping features, I stopped and removed the duplication before building more on top of it. Every later feature copies whatever pattern exists, so this was the cheapest moment to fix it. The rule was that behaviour must not change: the existing tests were not edited beyond how the app is built, and they all still pass.

| Before                                                                 | After                                                                                                                                   |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 9 access conditions written by hand (17 scope references) in 3 files   | One `scope.ts` module; every `where` comes from it                                                                                      |
| 7 response types copied by hand into the web app                       | 0: both sides use `@kisht/contracts`, and the web parses every response with it                                                         |
| Routes mixing HTTP and Prisma; `HttpError` defined in the session file | `modules/*/{routes,service}.ts`, `http/{errors,guards,origin}.ts`                                                                       |
| A clock injected into imports only                                     | One `AppContext.clock`, ready for the contact window and the demo clock                                                                 |
| Roll-rate maths in 2 places (the dashboard would have been a third)    | `domain/rollRate.ts`, unit tested; it gives the same 23.1% for the 2 Nov seed                                                           |
| User provisioning and root-env loading each repeated                   | `provisionUser` and `loadRootEnv` in `@kisht/db`                                                                                        |
| A 528-line import page                                                 | 19-line composition of `features/imports/*`                                                                                             |
| Package boundaries by convention                                       | Lint-enforced (`noRestrictedImports`); domain coverage ≥ 90% (now 99.5%)                                                                |
| Browser tests run only locally                                         | A CI job that migrates, seeds, builds and runs them                                                                                     |
| 90 tests                                                               | 101 tests, including contract guarantees (unlisted fields stripped, broken responses become a logged 500) and the documented route list |

Also renamed `@kisht/shared` to `@kisht/domain`: it holds business rules, and the name should say so. The API now serves OpenAPI docs at `/api/docs`, generated from the same schemas.

Deliberately not done: splitting into services, or adding CQRS or a repository layer over Prisma. For a product this size they add indirection without a benefit a reviewer could point to.

## Day 3: the priority model and the officer's screens (2026-11-04)

- **The back-test caught a bad model before anyone saw it.** The first version beat today's practice easily (59% of rolling rupees in each officer's first 10 loans, against 17%). But I had added a simple baseline to compare with, oldest first within 1–30 days, and it scored **88%**. The model was spending slots on 31+ loans that can't roll any more. The fix was to put loans that can still be stopped first, then rank by rupees at stake. Result: 91.8% vs 88.5% at ten loans, 68.3% vs 59.2% at five. Most of the gain is that stage rule; the model's own lead is modest, and [MODEL.md](MODEL.md) says so.
- **A feature was hiding the most obvious reason.** "Days overdue in the last 90" already contains the current spell, so it absorbed the DPD signal and "4 days to roll" hardly registered. It now counts only earlier lateness, so "close to rolling" and "often late before" are separate, true statements.
- **Reasons measured against a clean loan.** Measured against the average, one broken promise counted for nothing, because broken promises are common. Officers don't think like that. The ranking doesn't change, only the explanation. On LN-11930 the model still ranks the broken promise fourth, so it appears as a badge from the record rather than as a forced reason.
- **The phone's clock isn't trusted (D20).** Each batch says what the phone's clock read when sent, and the server corrects by the gap. A phone set back to 3 pm at 9 pm is still blocked; a real call at 18:50 synced at 21:00 still counts. Blocked attempts are stored, outcomes stand only on an allowed attempt, and retries change nothing.
- **Demo clock brought forward from day 6.** Browser tests have to pass at any hour, and otherwise a reviewer at night can't try the flow at all.
- **Caught by looking at the screens:** the seed had officers working "today", so the demo opened with outcomes timed later than the current time; "in 1 days"; sample notes contradicting their outcome; an overdue promise looking the same as an upcoming one.

## Day 4: working with no signal (2026-11-04)

- **The screen never waits for the network.** Each tap goes to an outbox in IndexedDB first. What the officer sees is the server's last list plus their unsent events, computed by one tested function (`applyUnsent`) that applies what the server will decide.
- **Moved to one payload (D22).** Today's list now carries each loan's history, so the loan screen makes no requests. It also lives on one static page addressed by query string: a dynamic path can't be served offline, because the cached HTML would hydrate as the wrong route.
- **The first offline tests were flaky, and I checked why before trusting them.** Repeating them showed a log reaching the server while the browser was "offline". Chrome's offline emulation doesn't reliably cover pages a service worker controls, so the harness was leaking network. The tests now also cut API calls explicitly, then passed 24 of 24 across repeats.
- **The tests found two real UX bugs:** one log counted as "2 waiting", because a visit queues an attempt and an outcome; and one refused log showed two alerts.
- **Measured the phone budget, and missed it.** First load was 258 KB of JS plus **415 KB of web fonts**, against a 200 KB target. Fonts are gone (D23) and the Better Auth client is replaced by two plain calls: now **245 KB of JS, no fonts**, with first paint on slow 3G and a 4x slower CPU going from 6.0 s to 4.5 s. Still 45 KB over. React and Next take 125 KB; zod 39; Dexie 35. Swapping Dexie for a small wrapper could reach about 212 KB, but not at the end of a day, right after the offline code was proven. It's on the refinement list. Later loads come from the phone.
- **Known limits.** The outbox sends only while the app is open (cut, with the reason, in REQUIREMENTS). Signing out with no signal clears the phone's data, but the server session stays valid until it expires or the officer signs out online. The dialler, GPS and install flow haven't been exercised on a real phone yet, only in a browser.

## Day 5: promises, reminders and the manager's controls (2026-11-04)

- **Advisory means a person can overrule it.** A manager can pin a loan's position, reassign it or clear a dispute. Each needs a reason, is audited, and a pin's reason is shown to the officer. Both the officer's list and the manager's board use one ordering function, so they can't disagree. A manual assignment now survives the next import; without that, tomorrow's upload would have silently undone the manager's decision.
- **Reminders are safe by construction.** They use fixed approved wording, are planned inside the window, and the dispatcher re-checks at send time: outside the window they're held until 8 am, and once a promise settles or a loan goes into dispute they're cancelled. Each is claimed before sending, so running twice can't send twice. Sending is mocked, and the screen says so.
- **A real layout bug the phone tests caught.** The manager's board was 488 px wide on a 412 px phone, because the officer chips stretched the grid. It only showed up as a bottom sheet whose button couldn't be tapped, since mobile click coordinates shift when the page is wider than the screen. Fixed, and every screen now has a test that it fits.
- **A test that wasn't testing.** The unassigned-queue test was skipping itself: it looked at the page before the data arrived, and took "nothing there" to mean the queue was empty. "2 skipped" in the summary gave it away. It now waits for the data.
- **Removed duplication while here.** The bottom sheet was written twice, so it's now one component used by logging, sign-out and all the manager's actions.

## Day 6: the dashboard and the activity log (2026-11-04)

- **Answers the client's sentence directly:** "I need roll rates by branch without waiting for Friday's Excel." The dashboard opens with the roll rate against the 16% target, then the loans about to roll that nobody has contacted yet, which is what someone can act on today. Everything comes from the same tested definitions as the rest of the app.
- **The numbers disagreed, so I checked before trusting either.** The dashboard said 82% where the model card said 68%. An independent calculation reproduced 82.4% exactly: they're different periods. It also showed the edge varies by week (73–86%), that the simple rule narrowly won one week, and that the earliest weeks are level at 52%. That's now in [MODEL.md](MODEL.md), with 68% as the number to quote.
- **Compliance you can check, not just claim.** The activity screen says no contact got through outside 8 am–7 pm, computed from the corrected time of every allowed attempt. A test plants a rule break and confirms it gets counted, so the zero means something.
- **Chart colours were validated, not eyeballed.** My first picks failed the lightness check in both themes, and the validator caught it. Every chart has a table view and works by keyboard, and there's no chart library (D25).
- **Small honesty fix.** An officer at 94.6% showed "95%" in amber against a 95% target. It now compares what's displayed.
- **Seed exceptions are generated by position, not randomly,** so adding them left the simulation and the model's numbers unchanged.

## Audit (2026-11-04)

With every screen built, I audited with tools rather than opinions: dead-code analysis, dependency vulnerabilities, axe, Lighthouse, then a read through the riskiest logic.

**Found by reading the code, and worth more than anything the tools found:**

| Problem                                                            | Why it mattered                                                                 | Now                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| One invalid entry jammed the outbox                                | A 400 was retried forever, "Sending…" spun, and everything behind it was stuck  | The batch is retried one by one; only the bad entry is set aside, with a message |
| The app waited on the network before showing a list it already had | Weak signal hangs rather than fails, so officers watched a spinner in the field | The phone's copy shows at once; every field request has a timeout (D27)          |
| Managers couldn't open a loan                                      | The API existed, but no screen used it                                          | Any borrower's name opens the loan, with history and an audited "show number"    |
| Reminders said `2026-11-07`                                        | Borrowers read these                                                            | "7 Nov" / "7 नव॰"                                                                |
| Abandoned import previews kept borrower data forever               | DPDP                                                                            | Deleted after 24 hours (A24)                                                     |
| A shared demo's clock stayed wherever the last visitor left it     | The next reviewer would see the wrong hour                                      | Returns to real time after 30 minutes                                            |
| A crash meant a blank page, and a bad link an English-only default | An officer has no way forward                                                   | Error and not-found screens in both languages                                    |
| The dashboard read all history on every load                       | It would slow down every day for years                                          | A bounded window                                                                 |

**Measured:**

| Check                                       | Before                        | After                                                             |
| ------------------------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| Accessibility violations (axe, WCAG 2.1 AA) | 3 kinds, including a critical | 0, on every screen in both themes; now a CI gate                  |
| Lighthouse accessibility                    | 94                            | 100                                                               |
| Lighthouse performance, officer's list      | 80                            | 83 on a first visit; repeat visits open from the phone            |
| Unused API endpoints and fields             | 1 endpoint, 7 fields          | 0                                                                 |
| Unused strings and exports                  | 2 and 9                       | 0 (the simulation's row types stay exported, as its public shape) |
| Security headers                            | none                          | CSP, frame denial, HSTS and others, with a test                   |
| Login rate limit                            | library default               | explicit per-IP limit, with a test                                |
| Browser tests                               | 50                            | 66                                                                |

**Real catches along the way:** faint text failed contrast in both themes; the manager's sign-out had no name on phones; sheets didn't hold keyboard focus. My new security policy also flagged the validation library probing for `eval`. It has a setting to skip the probe, so the policy stayed strict.

**Left as they are, on purpose:**

- **2 moderate advisories in the API docs' dependencies (`glob`, `minimatch`).** The fix was published today, and our supply-chain rule makes new releases wait. They come in through the docs page's file serving, and as far as I can see no user input reaches them. Update when the release ages in.
- **245 KB of JavaScript against a 200 KB target.** Replacing Dexie would save about 33 KB of a first load that happens once, in exchange for hand-written storage code in the riskiest part of the app. Not worth it.
- **First-visit LCP of 3.7 s on Lighthouse's slow profile.** It's a first visit with nothing on the phone yet; later opens come from the phone's copy.

## Second review (2026-11-04)

A second review raised six points. Each was checked against the code first.

- **Simultaneous sync retries returned a 500. Real.** Reproduced with eight identical batches at once. The check-then-insert let several through to the unique constraint. Inserts now skip conflicts, and only the one that actually inserted writes the promise and reminders.
- **Login rate limit was in memory. Real.** Moved to Postgres (D29), with a test that it holds across a restart.
- **`pnpm install` failed without a `.env`. Real.** Reproduced on a clean clone. `prisma generate` needs no database, so it no longer asks for a URL. `migrate` still stops with a clear message.
- **Stale status lines. Real.** Fixed, and the requirements checklist no longer quotes test counts or assumption ranges, which go stale.
- **`'unsafe-inline'` scripts. True, kept on purpose** (D30): nonces would cost the static shell that offline and weak-signal opening rely on.
- **The model's edge is modest. True, and already stated** in [MODEL.md](MODEL.md). No change: tuning the model to win more simulated weeks would prove nothing about real loans.

## AI reminder drafts (2026-11-05)

The last unbuilt requirement. An officer taps Send reminder on a loan, reads the draft and taps Send. The AI only ever sees a template such as "Hello {borrowerName}, {amount} is overdue", so a borrower's details can't reach it. Each reply is checked for blocked words, changed placeholders, invented numbers, links, length and language, and anything that fails is replaced by the approved wording.

**Browser tests caught a design mistake:** the button was first added to the shared call and map buttons, so it appeared on every card in the list. It now appears only on the loan screen.

The adapter now calls OpenRouter, with its free router as the default model. Because the model sees no personal data, a free model that keeps prompts is acceptable, and because every reply is checked, a weak one can only cost an AI draft, never send a bad message. `reminder_draft.fallbackReason` records why any draft fell back.

## Production dry run (2026-11-05)

A clean clone with no `.env`, `NODE_ENV=production` and the commands from `deployment.md` installed, built and served correctly. It also showed that everyone behind a proxy shared one sign-in limit, so about 20 wrong passwords a minute from anyone would have locked out every officer. The limiter trusted a forwarded header only when it held a single address, and a proxy adds more. The API now passes it the address recorded by the nearest trusted proxy, set by `TRUSTED_PROXY_HOPS`. Anything further left can be invented by the client, so it is ignored.
