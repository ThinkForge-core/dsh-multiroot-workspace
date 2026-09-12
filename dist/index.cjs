window.__ModuleLoader__.load({ id: "dsh-multiroot-workspace", factory: function (require) { const module = { exports: {} }; const exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
let _deepseek_ai_cordis = require("@deepseek-ai/cordis");
let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
let react = require("react");
let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
let react_jsx_runtime = require("react/jsx-runtime");

//#region src/client/navigation.ts
/** Workspace archive and directory UI capability. */
/** Structured directory failure exposed to directory UI consumers. */
var DirectoryBrowseError = class extends Error {
	rpcError;
	name = "DirectoryBrowseError";
	/** @param rpcError - Host directory business failure. */
	constructor(rpcError) {
		super(`directory browse failed: ${rpcError.code}: ${rpcError.message}`);
		this.rpcError = rpcError;
	}
};
/** Implements Workspace archive and directory UI operations. */
var UiWorkspaceService = class extends _deepseek_ai_cordis.Service {
	directoryPicker;
	workspaces;
	sessions;
	connecting = /* @__PURE__ */ new Map();
	lifetime = new AbortController();
	/**
	* @param ctx - Client root Context.
	* @param directoryPicker - the directory-picking Remote namespace.
	* @param workspaces - pure Workspace Controller.
	* @param sessions - pure Session Controller.
	*/
	constructor(ctx, directoryPicker, workspaces, sessions) {
		super(ctx, "uiWorkspace");
		this.directoryPicker = directoryPicker;
		this.workspaces = workspaces;
		this.sessions = sessions;
		ctx.effect(() => this.watchNavigation(), "ui-workspace: Workspace navigation policy");
	}
	async connectWorkspace(workspaceId) {
		const workspace = this.workspaces.list.getSnapshot().items.find((item) => item.workspaceId === workspaceId);
		if (workspace === void 0) throw new Error(`uiWorkspace.connectWorkspace: unknown workspace ${workspaceId}`);
		const inflight = this.connecting.get(workspaceId);
		if (inflight !== void 0) return inflight;
		const archived = this.workspaces.list.getSnapshot().archivedSessionIds;
		const sessions = this.sessions.list.getSnapshot();
		for (const id of sessions.ids) {
			const summary = sessions.byId[id];
			if (summary !== void 0 && summary.blank && summary.cwd === workspace.path && workspace.sessionIds.includes(summary.id) && !archived.includes(summary.id)) return summary.id;
		}
		const attempt = this.sessions.create({ workspaceId }).finally(() => {
			this.connecting.delete(workspaceId);
		});
		this.connecting.set(workspaceId, attempt);
		return attempt;
	}
	openSession(sessionId) {
		this.sessions.open(sessionId);
		this.ctx.layout.selectPanel(null);
	}
	async openWorkspace(workspaceId, beforeOpen) {
		const navigation = AbortSignal.any([this.ctx.layout.beginNavigation(), this.lifetime.signal]);
		const isCurrent = () => !navigation.aborted;
		const sessionId = await this.connectWorkspace(workspaceId);
		if (!isCurrent()) return;
		beforeOpen?.(sessionId);
		if (isCurrent()) this.openSession(sessionId);
	}
	async forkSession(sessionId) {
		const navigation = AbortSignal.any([this.ctx.layout.beginNavigation(), this.lifetime.signal]);
		const childId = await this.sessions.fork({
			sessionId,
			increaseTitle: true
		});
		if (!navigation.aborted) this.openSession(childId);
	}
	startSession(workspaceId) {
		const workspace = this.workspaces.list.getSnapshot();
		const sessions = this.sessions.list.getSnapshot();
		const current = sessions.current;
		const currentWorkspaceId = current === void 0 ? void 0 : workspace.items.find((item) => item.sessionIds.includes(current))?.workspaceId;
		const recent = workspace.phase === "ready" && sessions.phase === "ready" ? recentWorkspace(workspace.items, sessions.byId) : void 0;
		const target = workspaceId ?? currentWorkspaceId ?? recent;
		if (target === void 0) {
			this.sessions.clear();
			this.ctx.layout.selectPanel(null);
			return;
		}
		this.openWorkspace(target).catch((reason) => {
			console.warn("new session failed:", reason);
		});
	}
	async archiveSession(sessionId) {
		await this.workspaces.archiveSession(sessionId);
	}
	async pickDirectory() {
		const result = await this.directoryPicker.pick();
		if (!result.ok) throw new Error(`directory picker failed: ${result.error.message}`);
		return result.value;
	}
	async listDirectory(path, signal) {
		const result = await this.directoryPicker.list(path, signal);
		if (!result.ok) throw new DirectoryBrowseError(result.error);
		return result.value;
	}
	async createDirectory(path, name) {
		const result = await this.directoryPicker.createDirectory(path, name);
		if (!result.ok) throw new DirectoryBrowseError(result.error);
		return result.value;
	}
	watchNavigation() {
		let initial = "waiting";
		const reconcile = () => {
			if (this.lifetime.signal.aborted) return;
			if (this.clearArchivedCurrent()) return;
			if (initial !== "waiting") return;
			const workspace = this.workspaces.list.getSnapshot();
			const sessions = this.sessions.list.getSnapshot();
			if (workspace.phase !== "ready" || sessions.phase !== "ready") return;
			if (sessions.current !== void 0) {
				initial = "done";
				return;
			}
			const target = recentWorkspace(workspace.items, sessions.byId);
			if (target === void 0) {
				initial = "done";
				return;
			}
			initial = "connecting";
			this.connectWorkspace(target).then((sessionId) => {
				if (this.lifetime.signal.aborted) return;
				if (this.sessions.list.getSnapshot().current === void 0) this.sessions.open(sessionId);
				initial = "done";
			}, (reason) => {
				if (this.lifetime.signal.aborted) return;
				initial = "waiting";
				console.warn("initial workspace selection failed:", reason);
			});
		};
		const disposeWorkspaces = this.workspaces.list.subscribe(reconcile);
		const disposeSessions = this.sessions.list.subscribe(reconcile);
		reconcile();
		return () => {
			this.lifetime.abort();
			disposeSessions();
			disposeWorkspaces();
		};
	}
	/** @returns true when an archived current selection was cleared. */
	clearArchivedCurrent() {
		const current = this.sessions.list.getSnapshot().current;
		if (current === void 0 || !this.workspaces.list.getSnapshot().archivedSessionIds.includes(current)) return false;
		this.sessions.clear();
		return true;
	}
};
/** Stable tie-breaking follows Host Workspace order. */
function recentWorkspace(workspaces, sessions) {
	let selected;
	let selectedTime = Number.NEGATIVE_INFINITY;
	for (const workspace of workspaces) {
		let latest = Number.NEGATIVE_INFINITY;
		for (const sessionId of workspace.sessionIds) {
			const session = sessions[sessionId];
			if (session !== void 0) latest = Math.max(latest, session.updatedAt);
		}
		if (latest === Number.NEGATIVE_INFINITY) latest = Date.parse(workspace.createdAt);
		if (selected === void 0 || latest > selectedTime) {
			selected = workspace.workspaceId;
			selectedTime = latest;
		}
	}
	return selected;
}

//#endregion
//#region src/client/stores.ts
/**
* The workspace browser's viewing store: the session-list grouping mode,
* persisted across reloads. Module level exports the factory only (a
* module-level handle would pin the store identity across plugin reloads);
* register() receives the factory and the browser derives its PropsStore
* share from the return type.
*/
/** Browser-local order account for the hierarchy-free flat Session list. */
const FLAT_SESSION_ORDER_KEY = "__flat_session_order__";
/**
* Create the workspace browser viewing store handle.
* @returns the store handle (spec + type + identity + factory in one).
*/
function createWorkspaceViewStore() {
	return (0, _deepseek_ai_dsh_client_store.defineStore)({
		init: () => ({
			groupBy: "workspace",
			orderBy: "updated",
			groupExpansion: {},
			sessionOrderByAccount: {},
			sessionUpdatedAtByAccount: {}
		}),
		persist: "dsh.workspace.view.v5",
		actions: {
			setGroupBy: (d, mode) => {
				d.groupBy = mode;
			},
			setOrderBy: (d, mode) => {
				d.orderBy = mode;
			},
			setGroupExpanded: (d, key, expanded) => {
				d.groupExpansion[key] = expanded;
			},
			retainAccountKeys: (d, workspaceKeys) => {
				const retained = new Set(workspaceKeys);
				d.groupExpansion = Object.fromEntries(Object.entries(d.groupExpansion).filter(([key]) => retained.has(key)));
				d.sessionOrderByAccount = Object.fromEntries(Object.entries(d.sessionOrderByAccount).filter(([key]) => retained.has(key)));
				d.sessionUpdatedAtByAccount = Object.fromEntries(Object.entries(d.sessionUpdatedAtByAccount).filter(([key]) => retained.has(key)));
			},
			syncSessionOrderAccount: (d, accountKey, order, updatedAt) => {
				d.sessionOrderByAccount[accountKey] = order;
				d.sessionUpdatedAtByAccount[accountKey] = updatedAt;
			},
			setSessionOrder: (d, accountKey, order) => {
				d.sessionOrderByAccount[accountKey] = order;
			}
		}
	});
}

//#endregion
//#region node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
function r(e) {
	var t, f, n = "";
	if ("string" == typeof e || "number" == typeof e) n += e;
	else if ("object" == typeof e) if (Array.isArray(e)) {
		var o = e.length;
		for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
	} else for (f in e) e[f] && (n && (n += " "), n += f);
	return n;
}
function clsx() {
	for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
	return n;
}

//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-api-session-controller@0.1.5-rc.2_f6abae79571f790534db48922cafdc73/node_modules/@deepseek-ai/dsh-api-session-controller/lib/client.js
window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-api-session-controller",
	factory: (require$1) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_cordis = require$1("@deepseek-ai/cordis");
		let _deepseek_ai_dsh_api_gateway_client = require$1("@deepseek-ai/dsh-api-gateway/client");
		let _deepseek_ai_dsh_client_store = require$1("@deepseek-ai/dsh-client-store");
		/** The one Remote failure class shared by owners, the Gateway, and consumers. */
		/**
		* One Remote call failure: a real Error carrying its stable code and typed
		* details. Owners throw it at the failure point; the Host Gateway encodes it
		* onto the wire unchanged; the Client face rebuilds an instance for the
		* `RemoteResult` error branch, so `throw result.error` keeps throw semantics.
		* Discrimination is always by `code`, never by instanceof.
		*/
		var RemoteError = class extends Error {
			code;
			details;
			/** Structural marker: cross-realm/bundle identification never uses instanceof. */
			isDSHRemoteError = true;
			/**
			* @param code - stable failure code declared in {@link RemoteErrorDetailsMap}.
			* @param message - human diagnostic carried across the wire.
			* @param details - structured payload typed by the code.
			* @param options - standard Error options (`cause` survives in-process only).
			*/
			constructor(code, message, details, options) {
				super(message, options);
				this.code = code;
				this.details = details;
				this.name = "RemoteError";
			}
		};
		/** Client range access and type narrowing for aligned Session history records. */
		/**
		* Narrow aligned wire records to their Client event types without allocation.
		* @param records - validated history transport records.
		* @returns the same record array with typed inner events.
		*/
		function historyEntries(records) {
			return records;
		}
		/**
		* Read the first logical sequence represented by one wire record.
		* @param record - validated Session event.
		* @returns inclusive first Session sequence.
		*/
		function historyRecordFirstSeq(record) {
			return record.event.seq;
		}
		/**
		* Read the final logical sequence represented by one wire record.
		* @param record - validated Session event.
		* @returns inclusive final Session sequence.
		*/
		function historyRecordLastSeq(record) {
			return record.event.seq;
		}
		/**
		* Apply a compile-time number brand without changing the value.
		* @param value - number admitted by the domain that owns the target brand.
		* @returns the same number with the requested compile-time brand.
		*/
		function brandNumber(value) {
			return value;
		}
		/**
		* Admit a numeric value as an existing Session event position.
		* @param value - non-negative safe integer admitted by the owning log operation.
		* @returns the same number with the Session-sequence brand.
		*/
		function SessionSeq(value) {
			if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) throw new TypeError(`SessionSeq must be a non-negative safe integer, got ${String(value)}`);
			return brandNumber(value);
		}
		/**
		* Admit a numeric value as a Session log offset.
		* @param value - non-negative safe integer used as a gap or prefix length.
		* @returns the same number with the Session-log-offset brand.
		*/
		function SessionLogOffset(value) {
			if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) throw new TypeError(`SessionLogOffset must be a non-negative safe integer, got ${String(value)}`);
			return brandNumber(value);
		}
		/**
		* GENERATED by `scripts/gen-persistence-catalog.ts` — do not edit by hand; run
		* `pnpm run gen-persistence-catalog` to regenerate (verified fresh by
		* `pnpm run verify-persistence-catalog`, part of `doc-sync`).
		* @module @deepseek-ai/dsh-session/known-event-types
		*/
		/**
		* Every `SessionEventMap` member declared in this repository — the event
		* vocabulary this build understands. The persistence read path refuses to
		* interpret a log containing a type outside this set unless the event
		* carries the envelope's `ignorable` marker (see `SessionEvent.ignorable`
		* in `./types.ts`): such a log was likely written by a newer harness, and
		* silently skipping a required event would reconstruct a wrong session.
		* Downstream (out-of-repo) plugin events are outside this list by
		* construction. The persisted `SessionEvent.ignorable` marker is the
		* compatibility mechanism; event-name registration was rejected because
		* it does not classify omission safety and would make reads
		* composition-dependent. The rationale is in
		* `.agents/notes/implemented/architecture/2026-08-30-retain-ignorable-external-session-events.md`.
		*/
		const KNOWN_SESSION_EVENT_TYPES = /* @__PURE__ */ new Set([
			"agent-preset/selected",
			"agent/inbox/spliced",
			"approval/asked",
			"approval/decided",
			"approval/policy",
			"assistant/attempt",
			"assistant/message",
			"command/done",
			"command/run",
			"compaction/end",
			"compaction/prune",
			"compaction/start",
			"compaction/summary",
			"deliverables/presented",
			"feedback/message-delete",
			"feedback/message-put",
			"feedback/record",
			"goal/change",
			"hook/invoked",
			"hook/result",
			"llm/retry",
			"llm/retry-started",
			"model/selection",
			"permission/preset",
			"plan/mode",
			"request/context",
			"request/header",
			"sandbox/mode",
			"schedule/change",
			"session-log-deepseek/delivery-accepted",
			"session/end-seed",
			"session/title",
			"session/title-llm-request",
			"step/end",
			"step/start",
			"subagent/catalog",
			"subagent/descriptor",
			"subagent/model-selection-policy",
			"system/message",
			"team/member",
			"team/message/delivered",
			"team/message/queued",
			"team/task",
			"todo/write",
			"tool-workflow/agent-end",
			"tool-workflow/agent-start",
			"tool-workflow/run-end",
			"tool-workflow/run-start",
			"tool/call",
			"tool/ptc-dispatch",
			"tool/ptc-dispatch-start",
			"tool/result",
			"turn/end",
			"turn/start",
			"user/message",
			"web/deepseek-search-llm-request"
		]);
		/** Runtime counterpart of the message-producing event union. */
		const SURFACE_EVENT_TYPES = /* @__PURE__ */ new Set([
			"system/message",
			"user/message",
			"assistant/message",
			"tool/result"
		]);
		/**
		* Whether an event type can join the model-visible surface.
		* @param type - event type to test.
		* @returns true for one of the four message-producing event types.
		*/
		function isSurfaceEligibleType(type) {
			return SURFACE_EVENT_TYPES.has(type);
		}
		/** Whether a payload field is a JSON object rather than an array or scalar. */
		function isRecord(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		/**
		* Reject noncanonical request-header fields and contradictory tool failure metadata.
		* This does not validate complete event payloads or embedded provider streams.
		* @param event - event whose locally related payload fields are inspected.
		* @param subject - event location to include in validation errors.
		* @throws when request data/header is not an object, optional header fields are empty, or tool failure metadata contradicts its message.
		*/
		function validateSessionEventData(event, subject) {
			const data = event.data;
			if (event.type === "request/header") {
				if (!isRecord(data)) throw new Error(`${subject} data must be an object`);
				const header = data["header"];
				if (!isRecord(header)) throw new Error(`${subject} header must be an object`);
				if (Object.hasOwn(header, "system")) throw new Error(`${subject} must omit header.system; use system/message`);
				if (Array.isArray(header["tools"]) && header["tools"].length === 0) throw new Error(`${subject} must omit empty tools`);
				const defaults = header["adapterDefaults"];
				if (isRecord(defaults) && Object.keys(defaults).length === 0) throw new Error(`${subject} must omit empty adapterDefaults`);
			} else if (event.type === "tool/result") {
				if (!isRecord(data)) throw new Error(`${subject} data must be an object`);
				if (data["error"] === void 0) return;
				const message = data["message"];
				const content = isRecord(message) ? message["content"] : void 0;
				const block = Array.isArray(content) ? content[0] : void 0;
				if (!isRecord(block) || block["isError"] !== true) throw new Error(`${subject} error requires message content[0].isError === true`);
			}
		}
		/** Whether a runtime value is a non-negative safe event sequence. */
		function isEventSeq(value) {
			return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
		}
		/** Whether a runtime value is the exact positional-replacement shape. */
		function isReplaceOp(value) {
			const op = value;
			return Object.keys(op).length === 3 && Object.hasOwn(op, "op") && Object.hasOwn(op, "startSeq") && Object.hasOwn(op, "endSeq") && op["op"] === "replace" && isEventSeq(op["startSeq"]) && isEventSeq(op["endSeq"]);
		}
		/** Validate event-local surface eligibility and return its operation. */
		function surfaceOpOf(event) {
			const raw = event;
			if (!isSurfaceEligibleType(event.type)) {
				if (!KNOWN_SESSION_EVENT_TYPES.has(event.type) && event.ignorable === true) return;
				if (raw.surfaceOp !== void 0) throw new Error(`session event "${event.type}" is not surface-eligible and cannot carry surfaceOp`);
				if (raw.sourceEventSeqs !== void 0) throw new Error(`session event "${event.type}" is not surface-eligible and cannot carry sourceEventSeqs`);
				return;
			}
			const op = raw.surfaceOp;
			if (op === void 0) throw new Error(`session event "${event.type}" is surface-eligible and requires a surfaceOp marker`);
			if (op === "append") return op;
			if (op === null || typeof op !== "object" || Array.isArray(op)) throw new Error(`session event "${event.type}" carries an invalid surfaceOp`);
			if (!isReplaceOp(op)) throw new Error(`session event "${event.type}" carries an invalid replace surfaceOp`);
			return op;
		}
		/** Validate cited source-event seqs against prior log entries and the replacement range. */
		function assertProvenance(event, shadowedSeqs) {
			const raw = event.sourceEventSeqs;
			if (event.type === "assistant/message" && raw !== void 0) throw new Error("assistant/message embeds its source stream and cannot carry sourceEventSeqs");
			const sources = /* @__PURE__ */ new Set();
			if (raw !== void 0) {
				if (!Array.isArray(raw)) throw new Error(`sourceEventSeqs on event at seq ${event.seq} must be an array when present`);
				if (raw.length === 0) throw new Error("sourceEventSeqs must not be empty");
				let nonEarlierSource;
				for (const source of raw) {
					if (!isEventSeq(source)) throw new Error(`session event "${event.type}" sourceEventSeqs must densely contain non-negative safe integers`);
					sources.add(source);
					if (nonEarlierSource === void 0 && source >= event.seq) nonEarlierSource = source;
				}
				if (sources.size !== raw.length) throw new Error("sourceEventSeqs must not contain duplicates");
				if (nonEarlierSource !== void 0) throw new Error(`sourceEventSeqs must reference earlier events: ${nonEarlierSource} >= current seq ${event.seq}`);
			}
			const missing = shadowedSeqs.filter((seq) => !sources.has(seq));
			if (missing.length > 0) throw new Error(`surface replace: sourceEventSeqs must include every shadowed surface node; missing ${missing.join(", ")}`);
		}
		/**
		* Validate one event's surface metadata without checking membership in a log or surface.
		* @param event - event whose marker and source sequence values are inspected.
		* Unknown ignorable records retain opaque metadata and never change the surface.
		* @returns the validated operation, or undefined for a log-only or unknown ignorable event.
		* @throws when metadata violates event-local eligibility, marker, or source-sequence rules.
		*/
		function validateSurfaceMetadata(event) {
			const op = surfaceOpOf(event);
			if (op !== void 0 && op !== "append" && (op.startSeq >= event.seq || op.endSeq >= event.seq)) throw new Error(`surface replace at seq ${event.seq}: startSeq and endSeq must reference earlier events`);
			if (op !== void 0) assertProvenance(event, []);
			return op;
		}
		/** Event-local acceptance for raw Session journal responses; payloads remain owner-defined JSON. */
		/**
		* Reject non-current event envelopes without stripping or normalizing wire fields.
		* Range membership and source existence require the durable log and remain Host-owned.
		* @param value - one event received in a follow frame or history page.
		* @returns nothing after narrowing the accepted event envelope.
		* @throws when the envelope or current event-local metadata is invalid.
		*/
		function assertSessionWireEvent(value) {
			const subject = "session wire event";
			if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${subject} must be an object`);
			const event = value;
			for (const key of Object.keys(event)) switch (key) {
				case "type":
				case "seq":
				case "time":
				case "data":
				case "ignorable":
				case "surfaceOp":
				case "sourceEventSeqs": break;
				default: throw new Error(`${subject} has unexpected field ${key}`);
			}
			const seq = event["seq"];
			if (typeof event["type"] !== "string" || typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0 || Object.is(seq, -0) || typeof event["time"] !== "number" || !Number.isSafeInteger(event["time"]) || !Object.hasOwn(event, "data") || event["data"] === void 0 || Object.hasOwn(event, "ignorable") && event["ignorable"] !== true) throw new Error(`${subject} has an invalid envelope`);
			const current = event;
			validateSurfaceMetadata(current);
			validateSessionEventData(current, subject);
		}
		/** Browser-safe request, result, and lifecycle vocabulary for the Session Remote service. */
		/** Maximum number of Sessions returned by one search. */
		const SESSION_SEARCH_RESULT_LIMIT = 20;
		/** Maximum search snippet length in Unicode code points. */
		const SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS = 240;
		/** Session-specific adapters for Gateway-owned Remote stream lifecycles. */
		function toSessionJournalChange(change) {
			switch (change.type) {
				case "replace":
				case "prepend": return {
					...change,
					entries: historyEntries(change.entries)
				};
				case "append": return {
					type: "append",
					entry: change.entry
				};
				case "notification": return {
					type: "assistant-stream",
					frame: change.notification
				};
			}
		}
		/**
		* Create the Host-wide Session control snapshot stream.
		* @param remote - generated Session namespace and Gateway stream factory.
		* @param options - Session state destinations.
		* @returns an unstarted stream owned by the Client Session runtime.
		*/
		function createSessionControlStream(remote, options) {
			return new _deepseek_ai_dsh_api_gateway_client.RemoteSnapshotStream(remote.$stream({
				name: "session control stream",
				open: (signal) => remote.session.control(signal),
				ended: (accepted) => accepted ? new _deepseek_ai_dsh_api_gateway_client.RemoteStreamCarrierError("session control stream ended without a terminal result") : /* @__PURE__ */ new Error("session control stream ended before its opening snapshot"),
				...options.carrierFailed === void 0 ? {} : { carrierFailed: options.carrierFailed }
			}), {
				name: "session control stream",
				isSnapshot: (frame) => frame.type === "baseline",
				replace: options.accept,
				update: options.accept,
				failed: options.failed
			});
		}
		/** Gateway-owned event journal bound to one ordinary or direct-subagent Session address. */
		var SessionEventStream = class extends _deepseek_ai_dsh_api_gateway_client.RemoteJournalStream {
			remote;
			address;
			/**
			* @param remote - generated Session namespace and Gateway stream factory.
			* @param address - durable ordinary-Session or direct-subagent address.
			* @param options - Session event-window destinations.
			*/
			constructor(remote, address, options) {
				super(remote, {
					name: "session event stream",
					emptyCursor: -1,
					entries: (page) => page.records,
					hasMore: (page) => page.hasMore,
					first: historyRecordFirstSeq,
					last: historyRecordLastSeq,
					compare: (left, right) => left - right,
					follows: (left, right) => right === left + 1,
					publish: (change) => {
						options.publish(toSessionJournalChange(change));
					},
					...options.carrierFailed === void 0 ? {} : { carrierFailed: options.carrierFailed },
					failed: options.failed
				});
				this.remote = remote;
				this.address = address;
			}
			/** @inheritdoc */
			async *follow(request, signal) {
				let assistantRevision;
				for await (const frame of this.remote.session.follow({
					address: this.address,
					assistantStream: true,
					...request.maxMessages === void 0 ? {} : { maxMessages: request.maxMessages }
				}, signal)) {
					if (frame.type === "snapshot") {
						for (const record of frame.records) assertSessionWireEvent(record.event);
						if (frame.assistantStream === void 0) throw new RemoteError("gateway/internal", "session assistant stream omitted its opted-in opening baseline", {});
						assistantRevision = frame.assistantStream.revision;
						yield {
							type: "opened",
							cursor: frame.cursor,
							page: {
								records: frame.records,
								hasMore: frame.hasMore,
								projections: frame.projections,
								assistantStream: frame.assistantStream
							}
						};
						continue;
					}
					if (frame.type === "assistant-stream") {
						const expected = (assistantRevision ?? 0) + 1;
						if (frame.frame.revision !== expected) throw new _deepseek_ai_dsh_api_gateway_client.RemoteStreamCarrierError(`session assistant stream skipped revision ${String(expected)}`);
						assistantRevision = frame.frame.revision;
						yield {
							type: "notification",
							notification: frame.frame
						};
						continue;
					}
					assertSessionWireEvent(frame.event);
					yield {
						type: "entry",
						entry: frame
					};
				}
			}
			/** @inheritdoc */
			async readPage(request, throughSeq, signal) {
				const result = await this.remote.session.page({
					address: this.address,
					throughSeq,
					...request
				}, signal);
				if (!result.ok) throw result.error;
				for (const record of result.value.records) assertSessionWireEvent(record.event);
				return result.value;
			}
			/** @inheritdoc */
			repairRequest(request) {
				return request.maxMessages === void 0 ? {} : { maxMessages: request.maxMessages };
			}
		};
		/**
		* Read the final non-empty segment of a Workspace path for display.
		* Workspace-label surfaces use this helper instead of deriving another basename.
		* @param path - Workspace directory path using POSIX or Windows separators.
		* @returns the final segment, or an empty string for a separator-only path.
		*/
		function workspaceTitleOf(path) {
			const trimmed = path.replace(/[/\\]+$/, "");
			const separator = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
			return trimmed.slice(separator + 1);
		}
		/**
		* Client Agent-scope primitive: mint a Cordis context tagged with the owning
		* Agent's identity. The mechanism mirrors the host `dsh-scope` architecture
		* (no-op plugin fiber + context tag + `Context.filter` routing predicate);
		* the shape deliberately diverges: the filter lives on the actx itself
		* instead of a separate carrier object, so scoped dispatch is plain cordis —
		* `actx.bail(actx, event, payload)` / `actx.emit(actx, ...)` — with no
		* wrapper. The host needs a detached carrier because its dispatch subject is
		* the business Agent object; client scope events carry only ids, so the
		* actx is the natural subject. The second divergence stands: the scope key
		* is the branded `SessionId` (value compared), not an object identity — the
		* agent and its session share one id (1:1, same axis; no separate AgentId
		* brand), and a client scope's identity IS that wire id. Third divergence,
		* deliberate: the client scopes the Agent IDENTITY, not a live Agent object
		* — a cold session's host Agent is already disposed while its client actx
		* stays alive for history viewing.
		*/
		/** Context tag written by {@link createScope}. */
		const kScope = Symbol("dsh.client.scope");
		/** Shared no-op plugin backing each Agent scope fiber. */
		function agentScope() {}
		/**
		* Mint an Agent scope under `ctx`: a no-op plugin fiber whose context
		* carries the agent tag and the dispatch filter — untagged listeners are
		* admitted globally, tagged listeners only for a matching agent.
		* Registrations through the returned ctx dispose with the fiber.
		* @param ctx - client root context the scope fiber mounts under.
		* @param key - owning agent identity (the routing tag; agent id === session id).
		* @returns the tagged context and its backing fiber.
		*/
		function createScope(ctx, key) {
			const fiber = ctx.plugin(agentScope);
			return {
				fiber,
				ctx: fiber.ctx.extend({
					[kScope]: key,
					[_deepseek_ai_cordis.Context.filter](listenerCtx) {
						const tag = scopeOf(listenerCtx);
						return tag === void 0 || tag === key;
					}
				})
			};
		}
		/**
		* Read the nearest agent tag inherited by a context.
		* @param ctx - any client context.
		* @returns its agent identity (the session id), or undefined for root contexts.
		*/
		function scopeOf(ctx) {
			return ctx[kScope];
		}
		/**
		* Merge an authoritative baseline without moving identities already visible to
		* the client. Baseline-only identities are inserted relative to the nearest
		* following known identity; identities absent from the baseline are removed.
		*
		* @param current - the established client order.
		* @param baseline - the latest authoritative rows.
		* @param keyOf - stable identity selector.
		* @returns baseline-valued rows with the established relative order retained.
		*/
		function mergeOrderedBaseline(current, baseline, keyOf) {
			const baselineByKey = /* @__PURE__ */ new Map();
			for (const value of baseline) baselineByKey.set(keyOf(value), value);
			const merged = current.map((value) => baselineByKey.get(keyOf(value))).filter((value) => value !== void 0);
			const mergedKeys = new Set(merged.map(keyOf));
			for (let index = 0; index < baseline.length; index++) {
				const value = baseline[index];
				/* v8 ignore next -- dense-array guard: index is bounded by baseline.length. */
				if (value === void 0 || mergedKeys.has(keyOf(value))) continue;
				let insertion = merged.length;
				for (let following = index + 1; following < baseline.length; following++) {
					const candidate = baseline[following];
					/* v8 ignore next -- dense-array guard: following is bounded by baseline.length. */
					if (candidate === void 0) continue;
					const known = merged.findIndex((item) => keyOf(item) === keyOf(candidate));
					if (known !== -1) {
						insertion = known;
						break;
					}
				}
				merged.splice(insertion, 0, value);
				mergedKeys.add(keyOf(value));
			}
			return merged;
		}
		/**
		* Summaries -> flat list with lineage indentation. Root and sibling order
		* follows the established input order; this projection never re-sorts a
		* hydrated list from mutable timestamps.
		* @param summaries - the host's session.list items.
		* @param completed - sessions with a pending completion reminder (manager-owned live fact; absent = false).
		* @returns display rows in render order.
		*/
		function flattenLineage(summaries, completed) {
			const byId = /* @__PURE__ */ new Map();
			for (const s of summaries) byId.set(s.sessionId, s);
			const children = /* @__PURE__ */ new Map();
			const roots = [];
			for (const s of summaries) if (s.parentSessionId !== void 0 && byId.has(s.parentSessionId)) {
				const list = children.get(s.parentSessionId) ?? [];
				list.push(s);
				children.set(s.parentSessionId, list);
			} else roots.push(s);
			const out = [];
			const visited = /* @__PURE__ */ new Set();
			const walk = (s, depth) => {
				if (visited.has(s.sessionId)) {
					console.warn(`[session-controller] lineage cycle at ${s.sessionId}; emitting as root`);
					return;
				}
				visited.add(s.sessionId);
				out.push({
					...s,
					completed: completed?.has(s.sessionId) ?? false,
					depth
				});
				const kids = children.get(s.sessionId);
				if (kids === void 0) return;
				for (const kid of kids) walk(kid, depth + 1);
			};
			for (const root of roots) walk(root, 0);
			for (const s of summaries) if (!visited.has(s.sessionId)) walk(s, 0);
			return out;
		}
		/**
		* Batches structural updates in microtasks and stream updates by animation
		* frame. Reads may rebuild a dirty snapshot without consuming the pending
		* subscriber notification.
		*/
		var Notifier = class {
			rebuild;
			listeners = /* @__PURE__ */ new Set();
			dirty = false;
			notifyPending = false;
			scheduled = "none";
			scheduleGeneration = 0;
			/** @param rebuild - snapshot rebuild function injected by the owner (writes the owner's snapshotCache). */
			constructor(rebuild) {
				this.rebuild = rebuild;
			}
			/**
			* uSES subscription entry.
			* @param listener - change callback.
			* @returns the unsubscribe function.
			*/
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			/** Mark the snapshot dirty and notify in a microtask. */
			markDirty() {
				this.dirty = true;
				this.notifyPending = true;
				if (this.scheduled === "microtask") return;
				this.schedule("microtask");
			}
			/** Mark the snapshot dirty and publish cumulative state at most once per frame. */
			markFrameDirty() {
				this.dirty = true;
				this.notifyPending = true;
				if (this.scheduled !== "none") return;
				this.schedule(typeof globalThis.requestAnimationFrame === "function" ? "frame" : "microtask");
			}
			/**
			* Synchronous flush: controlled-input writes must notify in the same tick as
			* onChange, or React rolls the DOM back to the stale value and the caret jumps to the end.
			*/
			notifyNow() {
				this.dirty = true;
				this.notifyPending = true;
				this.invalidateSchedule();
				this.flush();
			}
			/**
			* Pre-getSnapshot check: rebuild synchronously when dirty (read path
			* before first subscribe / while unobserved). Notification stays pending.
			*/
			ensureFresh() {
				if (!this.dirty) return;
				this.dirty = false;
				this.rebuild();
			}
			schedule(kind) {
				const generation = ++this.scheduleGeneration;
				this.scheduled = kind;
				const publish = () => {
					if (generation !== this.scheduleGeneration) return;
					this.scheduled = "none";
					this.flush();
				};
				if (kind === "frame") globalThis.requestAnimationFrame(publish);
				else queueMicrotask(publish);
			}
			invalidateSchedule() {
				this.scheduleGeneration++;
				this.scheduled = "none";
			}
			flush() {
				if (!this.notifyPending) return;
				if (this.listeners.size === 0) return;
				this.notifyPending = false;
				if (this.dirty) {
					this.dirty = false;
					this.rebuild();
				}
				(0, _deepseek_ai_dsh_client_store.notifySubscribers)(this.listeners, "[session-controller]");
			}
		};
		/**
		* One session's projection values. Framework semantics, uniform across every
		* key: a baseline seeds rows at its cut, a push frame updates one row, and in
		* both paths a lower-or-equal seq loses — a replayed frame cannot regress a
		* value, a stale baseline cannot overwrite a newer frame. A key the store has
		* never seen reads `undefined` (capability absent). Faces are identity-stable
		* per key (create-on-demand, cached) so the React side binds each exactly
		* once; the store-level channel (`subscribeAny`) serves coarse consumers (the
		* manager's list projection reads the `title` key).
		*/
		var ProjectionValueStore = class {
			rows = /* @__PURE__ */ new Map();
			channels = /* @__PURE__ */ new Map();
			valuesCache;
			/** Coarse any-key channel (no snapshot cache to rebuild: reads hit rows directly). */
			anyNotifier = new Notifier(() => {});
			/**
			* Key-addressed bare observable face (the useProjection resolution path).
			* Always defined — absence is an `undefined` snapshot, never a missing
			* face, so a component may subscribe before the key ever carries a value.
			* @param key - projection key.
			* @returns the identity-stable face for this key.
			*/
			faceOf(key) {
				return this.channel(key).face;
			}
			/**
			* Current whole value for a key (erased framework read; typed reads go
			* through `useProjection`'s map lookup).
			* @param key - projection key.
			* @returns the value, or undefined while the key is absent.
			*/
			get(key) {
				return this.rows.get(key)?.value;
			}
			/**
			* Read every current projection value as one reference-stable snapshot.
			* @returns The same frozen value map until a row changes.
			*/
			values() {
				if (this.valuesCache === void 0) this.valuesCache = Object.freeze(Object.fromEntries([...this.rows].map(([key, row]) => [key, row.value])));
				return this.valuesCache;
			}
			/**
			* Subscribe to any-key changes (microtask-batched) — the manager's list
			* rebuild channel.
			* @param listener - change callback.
			* @returns the unsubscribe function.
			*/
			subscribeAny(listener) {
				return this.anyNotifier.subscribe(listener);
			}
			/**
			* Apply one finished value from the Session control stream.
			* @param key - projection key.
			* @param value - whole value computed by the host unit.
			* @param seq - the unit's watermark at emission.
			*/
			apply(key, value, seq) {
				const row = this.rows.get(key);
				if (row !== void 0 && seq <= row.seq) return;
				this.rows.set(key, {
					value,
					seq
				});
				this.changed(key);
			}
			/**
			* Seed from a history tail page's projections block: every carried key
			* lands under the same seq rule as frames; a key the block omits is
			* capability-absent as of the cut — its row clears unless a newer frame
			* already superseded the cut (a stale baseline can neither overwrite nor
			* clear newer values).
			* @param baseline - the response's projections block.
			*/
			seed(baseline) {
				const values = baseline.values;
				for (const key of Object.keys(values)) this.apply(key, values[key], baseline.asOfSeq);
				for (const [key, row] of this.rows) {
					if (Object.hasOwn(values, key)) continue;
					if (row.seq > baseline.asOfSeq) continue;
					this.rows.delete(key);
					this.changed(key);
				}
			}
			/**
			* Drop rows beyond a replacement control baseline. Such rows describe
			* process state the Host lost before persisting it and would otherwise
			* outrank recomputed lower-seq values forever. The caller seeds the new
			* baseline immediately afterward.
			* @param lastSeq - highest durable sequence reflected by the baseline.
			*/
			truncate(lastSeq) {
				for (const [key, row] of this.rows) {
					if (row.seq <= lastSeq) continue;
					this.rows.delete(key);
					this.changed(key);
				}
			}
			changed(key) {
				this.valuesCache = void 0;
				this.channels.get(key)?.notifier.markDirty();
				this.anyNotifier.markDirty();
			}
			channel(key) {
				let channel = this.channels.get(key);
				if (channel === void 0) {
					const notifier = new Notifier(() => {});
					channel = {
						notifier,
						face: {
							getSnapshot: () => this.rows.get(key)?.value,
							subscribe: (listener) => notifier.subscribe(listener)
						}
					};
					this.channels.set(key, channel);
				}
				return channel;
			}
		};
		/**
		* Random v4 UUID, minted from `crypto.getRandomValues`.
		* @returns the UUID string.
		*/
		function randomUUID() {
			const bytes = globalThis.crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(16));
			const hex = Array.from(bytes, (byte, index) => {
				return (index === 6 ? byte & 15 | 64 : index === 8 ? byte & 63 | 128 : byte).toString(16).padStart(2, "0");
			}).join("");
			return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
		}
		/** Observable contiguous Session event window consumed by domain assemblers. */
		function leaf(entries) {
			return {
				kind: "leaf",
				entries,
				length: entries.length
			};
		}
		function concat(left, right) {
			return {
				kind: "concat",
				left,
				right,
				length: left.length + right.length
			};
		}
		function materialize(node) {
			if (node.kind === "leaf") return node.entries;
			const entries = new Array(node.length);
			const pending = [node];
			let index = 0;
			while (pending.length > 0) {
				const current = pending.pop();
				if (current.kind === "concat") {
					pending.push(current.right, current.left);
					continue;
				}
				for (const entry of current.entries) {
					entries[index] = entry;
					index += 1;
				}
			}
			return entries;
		}
		function windowSnapshot(node, hasMore, revision, change) {
			let entries;
			return {
				get entries() {
					entries ??= materialize(node);
					return entries;
				},
				hasMore,
				revision,
				change
			};
		}
		/** Session-owned event feed; every accepted window mutation publishes synchronously. */
		var MutableSessionEventSource = class {
			listeners = /* @__PURE__ */ new Set();
			window = leaf([]);
			snapshot = windowSnapshot(this.window, false, 0, {
				kind: "replace",
				entries: []
			});
			/** @returns the cached event-window snapshot. */
			getSnapshot() {
				return this.snapshot;
			}
			/**
			* Subscribe to synchronous window publication.
			* @param listener - invalidation callback.
			* @returns unsubscribe function.
			*/
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			/**
			* Replace the complete contiguous window.
			* @param entries - complete window.
			* @param hasMore - whether older history remains.
			*/
			replace(entries, hasMore) {
				this.window = leaf(entries);
				this.publish(hasMore, {
					kind: "replace",
					entries
				});
			}
			/**
			* Prepend one older contiguous page.
			* @param entries - newly loaded older entries.
			* @param hasMore - whether still older history remains.
			*/
			prepend(entries, hasMore) {
				this.window = concat(leaf(entries), this.window);
				this.publish(hasMore, {
					kind: "prepend",
					entries
				});
			}
			/**
			* Append one contiguous live entry.
			* @param entry - live tail entry.
			*/
			append(entry) {
				const entries = [entry];
				this.window = concat(this.window, leaf(entries));
				this.publish(this.snapshot.hasMore, {
					kind: "append",
					entries
				});
			}
			/**
			* Replace one attempt's transient rows with its committed durable settlement.
			* @param attemptId - process-local attempt whose live rows are now redundant.
			* @param entry - durable settlement committed for that attempt.
			*/
			settleAssistant(attemptId, entry) {
				const entries = materialize(this.window).filter((candidate) => candidate.type !== "transient" || candidate.event.data.attemptId !== attemptId);
				if (entry !== void 0) {
					const index = entries.findIndex((candidate) => candidate.event.seq > entry.event.seq);
					if (index < 0) entries.push(entry);
					else entries.splice(index, 0, entry);
				}
				this.window = leaf(entries);
				this.publish(this.snapshot.hasMore, {
					kind: "settle-assistant",
					attemptId,
					...entry === void 0 ? {} : { entry }
				});
			}
			publish(hasMore, change) {
				this.snapshot = windowSnapshot(this.window, hasMore, this.snapshot.revision + 1, change);
				(0, _deepseek_ai_dsh_client_store.notifySubscribers)(this.listeners, "[session-controller] event feed");
			}
		};
		/** Browser-owned time-zone sampling for prompt RPC provenance. */
		/**
		* Resolve the current browser IANA zone for one outbound operation.
		* @returns The browser-provided canonical zone.
		* @throws when the runtime cannot provide a non-empty zone.
		*/
		function resolvedClientTimeZone() {
			const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
			if (typeof timeZone !== "string" || timeZone.length === 0) throw new Error("browser time zone is unavailable");
			return timeZone;
		}
		const QUEUE_PREVIEW_CHARS = 200;
		function previewOf(content) {
			const flat = content.filter((block) => block.type !== "image" && block.type !== "file").map((block) => block.type === "text" ? block.text : `[${block.type}]`).join(" ").replace(/\s+/g, " ").trim();
			const chars = Array.from(flat);
			return chars.length > QUEUE_PREVIEW_CHARS ? `${chars.slice(0, QUEUE_PREVIEW_CHARS).join("")}…` : flat;
		}
		function textOf(content) {
			if (!content.every((block) => block.type === "text")) return null;
			return content.map((block) => block.text).join("");
		}
		/** Authoritative transient queue projection and durable steering handoff. */
		var SessionQueueMirror = class {
			current = [];
			/**
			* Return the current immutable queue projection.
			* @returns current queue rows.
			*/
			snapshot() {
				return this.current;
			}
			/**
			* Replace from one authoritative stream queue frame.
			* @param items - complete host queue snapshot.
			*/
			replace(items) {
				this.current = items.map((item) => {
					const content = item.message.content;
					return {
						id: item.id,
						messageId: item.message.id,
						placement: item.placement,
						...item.rpcId === void 0 ? {} : { rpcId: item.rpcId },
						content,
						preview: previewOf(content),
						text: textOf(content)
					};
				});
			}
			/**
			* Retire a transient steering row once its durable message enters the log.
			* @param event - newly contiguous durable Session event.
			* @returns whether the projection changed.
			*/
			acceptDurable(event) {
				if (event.type !== "user/message") return false;
				const messageId = event.data.id;
				const index = this.current.findIndex((item) => item.placement === "steering" && item.messageId === messageId);
				if (index < 0) return false;
				this.current = this.current.filter((_item, candidate) => candidate !== index);
				return true;
			}
		};
		/** Whether a realm-owned intrinsic prototype is backed by its native constructor. */
		function hasIntrinsicConstructor(prototype, name) {
			const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor")?.value;
			if (typeof constructor !== "function") return false;
			try {
				return constructor.name === name && constructor.prototype === prototype && Function.prototype.toString.call(constructor) === `function ${name}() { [native code] }`;
			} catch {
				return false;
			}
		}
		/** Whether a candidate is one realm's intrinsic `Object.prototype`. */
		function isIntrinsicObjectPrototype(value) {
			return Object.getPrototypeOf(value) === null && hasIntrinsicConstructor(value, "Object");
		}
		/** Whether an array uses one realm's intrinsic `Array.prototype`, not a subclass or forged prototype. */
		function hasPlainArrayPrototype(value) {
			const prototype = Object.getPrototypeOf(value);
			if (!Array.isArray(prototype) || !hasIntrinsicConstructor(prototype, "Array")) return false;
			const objectPrototype = Object.getPrototypeOf(prototype);
			return typeof objectPrototype === "object" && objectPrototype !== null && isIntrinsicObjectPrototype(objectPrototype);
		}
		/** Whether an object is a plain or null-prototype record from any JavaScript realm. */
		function hasPlainObjectPrototype(value) {
			const prototype = Object.getPrototypeOf(value);
			return prototype === null || typeof prototype === "object" && isIntrinsicObjectPrototype(prototype);
		}
		/** Return every JSON-visible object key, or reject own data JSON would discard. */
		function enumerableStringKeys(value) {
			const keys = Reflect.ownKeys(value);
			if (keys.some((key) => typeof key !== "string" || !Object.prototype.propertyIsEnumerable.call(value, key))) return void 0;
			return keys;
		}
		/** Validate lossless JSON iteratively, optionally materializing a detached snapshot. */
		function walkJsonValue(value, detach) {
			const ancestors = /* @__PURE__ */ new Set();
			let root;
			const assign = (destination, item) => {
				if (destination === void 0) return;
				if (destination.kind === "root") root = item;
				else if (destination.kind === "array") destination.target[destination.index] = item;
				else Object.defineProperty(destination.target, destination.key, {
					value: item,
					enumerable: true,
					configurable: true,
					writable: true
				});
			};
			const tasks = [{
				kind: "visit",
				value,
				...detach ? { destination: { kind: "root" } } : {}
			}];
			for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
				if (task.kind === "leave") {
					ancestors.delete(task.source);
					continue;
				}
				if (task.kind === "array-item") {
					if (!Object.prototype.hasOwnProperty.call(task.source, task.index)) return void 0;
					tasks.push({
						kind: "visit",
						value: task.source[task.index],
						...task.target === void 0 ? {} : { destination: {
							kind: "array",
							target: task.target,
							index: task.index
						} }
					});
					continue;
				}
				if (task.kind === "object-property") {
					tasks.push({
						kind: "visit",
						value: task.source[task.key],
						...task.target === void 0 ? {} : { destination: {
							kind: "object",
							target: task.target,
							key: task.key
						} }
					});
					continue;
				}
				const current = task.value;
				if (current === null) {
					assign(task.destination, null);
					continue;
				}
				if (typeof current === "boolean" || typeof current === "string") {
					assign(task.destination, current);
					continue;
				}
				if (typeof current === "number") {
					if (!Number.isFinite(current) || Object.is(current, -0)) return void 0;
					assign(task.destination, current);
					continue;
				}
				if (typeof current !== "object") return void 0;
				if (ancestors.has(current)) return void 0;
				if (Array.isArray(current)) {
					if (!hasPlainArrayPrototype(current)) return void 0;
					const length = current.length;
					if (Reflect.ownKeys(current).length !== length + 1) return void 0;
					const target = detach ? [] : void 0;
					if (target !== void 0) assign(task.destination, target);
					ancestors.add(current);
					tasks.push({
						kind: "leave",
						source: current
					});
					for (let index = length - 1; index >= 0; index--) tasks.push({
						kind: "array-item",
						source: current,
						index,
						...target === void 0 ? {} : { target }
					});
					continue;
				}
				if (!hasPlainObjectPrototype(current)) return void 0;
				const keys = enumerableStringKeys(current);
				if (keys === void 0) return void 0;
				const target = detach ? {} : void 0;
				if (target !== void 0) assign(task.destination, target);
				ancestors.add(current);
				tasks.push({
					kind: "leave",
					source: current
				});
				for (let index = keys.length - 1; index >= 0; index--) {
					const key = keys[index];
					/* v8 ignore next -- the loop is bounded by the captured key count. */
					if (key === void 0) return void 0;
					tasks.push({
						kind: "object-property",
						source: current,
						key,
						...target === void 0 ? {} : { target }
					});
				}
			}
			return detach ? root : true;
		}
		/**
		* Validate and detach lossless JSON in one read per property.
		* @param value - candidate value to validate and detach.
		* @returns the detached snapshot, or `undefined` when the value is not losslessly JSON-serializable.
		*/
		function snapshotJsonValue(value) {
			return walkJsonValue(value, true);
		}
		/**
		* Deep-freeze an object graph in place while leaving live AbortSignal objects mutable.
		* @param value - value to freeze.
		* @returns the same value after every reachable enumerable child is frozen.
		*/
		function deepFreeze(value) {
			const seen = /* @__PURE__ */ new WeakSet();
			const pending = [{
				kind: "visit",
				node: value
			}];
			while (pending.length > 0) {
				const task = pending.pop();
				/* v8 ignore next -- the loop condition guarantees one pending task. */
				if (task === void 0) continue;
				if (task.kind === "property") {
					pending.push({
						kind: "visit",
						node: task.source[task.key]
					});
					continue;
				}
				const node = task.node;
				if (node === null || typeof node !== "object") continue;
				if (node instanceof AbortSignal) continue;
				if (seen.has(node)) continue;
				seen.add(node);
				Object.freeze(node);
				const keys = Object.keys(node);
				for (let index = keys.length - 1; index >= 0; index--) {
					const key = keys[index];
					/* v8 ignore next -- the loop is bounded by the captured key count. */
					if (key === void 0) continue;
					pending.push({
						kind: "property",
						source: node,
						key
					});
				}
			}
			return value;
		}
		/**
		* Lossless compact representation of one model-stream attempt, plus record-level
		* readers that answer common consumer questions without materializing members.
		* Readers trust the static record type; expandAssistantStream is the validating
		* path for records read at a durable boundary.
		*/
		function safeTime(value) {
			if (!Number.isSafeInteger(value)) throw new TypeError(`Assistant stream time must be a safe integer, got ${String(value)}`);
			return value;
		}
		function safeIndex(value, label) {
			if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) throw new TypeError(`${label} index must be a non-negative safe integer`);
			return value;
		}
		function snapshotChunk(chunk) {
			const snapshot = snapshotJsonValue(chunk);
			if (snapshot === void 0) throw new TypeError("Assistant stream chunk must be losslessly JSON-serializable");
			return snapshot;
		}
		/**
		* Expand compact records into the exact timed chunk sequence.
		* @param stream - compact records from one durable Assistant settlement.
		* @returns detached timed chunks with every original delta boundary preserved.
		* @throws {TypeError} when a record or reconstructed timestamp is invalid.
		*/
		function expandAssistantStream(stream) {
			const chunks = [];
			for (const candidate of stream) {
				const record = validateRecord(candidate);
				if (record.type === "chunk") {
					chunks.push({
						time: record.time,
						chunk: record.chunk
					});
					continue;
				}
				const members = record.type === "tool-call-chunks" ? record.args : record.texts;
				let time = record.time0;
				for (let index = 0; index < members.length; index += 1) {
					if (index > 0) time += record.dt[index - 1];
					let chunk;
					if (record.type === "text-chunks") chunk = {
						type: "text-delta",
						index: record.index,
						text: members[index]
					};
					else if (record.type === "reasoning-chunks") chunk = {
						type: "reasoning-delta",
						index: record.index,
						text: members[index]
					};
					else chunk = {
						type: "tool-call-delta",
						index: record.index,
						id: record.id,
						...Object.hasOwn(record, "name") ? { name: record.name } : {},
						argumentsDelta: members[index]
					};
					chunks.push({
						time,
						chunk
					});
				}
			}
			return chunks;
		}
		function validateRecord(value) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("Assistant stream record must be an object");
			const record = value;
			switch (record.type) {
				case "text-chunks":
				case "reasoning-chunks": {
					exactKeys(record, [
						"type",
						"time0",
						"index",
						"dt",
						"texts"
					], record.type);
					const texts = stringArray(record.texts, `${record.type} texts`);
					if (texts.length === 0) throw new TypeError(`${record.type} texts must be non-empty`);
					validateRun(record, texts.length, record.type);
					return record;
				}
				case "tool-call-chunks": {
					exactKeys(record, Object.hasOwn(record, "name") ? [
						"type",
						"time0",
						"index",
						"dt",
						"id",
						"name",
						"args"
					] : [
						"type",
						"time0",
						"index",
						"dt",
						"id",
						"args"
					], record.type);
					const args = stringArray(record.args, "tool-call-chunks args");
					if (args.length === 0) throw new TypeError("tool-call-chunks args must be non-empty");
					if (typeof record.id !== "string" || record.id.length === 0) throw new TypeError("tool-call-chunks id must be a non-empty string");
					if (record.name !== void 0 && (typeof record.name !== "string" || record.name.length === 0)) throw new TypeError("tool-call-chunks name must be a non-empty string");
					validateRun(record, args.length, record.type);
					return record;
				}
				case "chunk": {
					exactKeys(record, [
						"type",
						"time",
						"chunk"
					], "chunk");
					const time = safeTime(record.time);
					if (typeof record.chunk !== "object" || record.chunk === null || Array.isArray(record.chunk)) throw new TypeError("Assistant stream raw chunk must be a lossless JSON object");
					let chunk;
					try {
						chunk = snapshotChunk(record.chunk);
					} catch (error) {
						throw new TypeError("Assistant stream raw chunk must be a lossless JSON object", { cause: error });
					}
					return deepFreeze({
						type: "chunk",
						time,
						chunk
					});
				}
				default: throw new TypeError(`Unsupported Assistant stream record ${JSON.stringify(record.type)}`);
			}
		}
		function validateRun(record, members, label) {
			safeTime(record.time0);
			safeIndex(record.index, label);
			if (!Array.isArray(record.dt) || record.dt.some((value) => !Number.isSafeInteger(value))) throw new TypeError(`${label} dt must contain safe integers`);
			if (record.dt.length !== members - 1) throw new TypeError(`${label} dt length must be one less than its members`);
			let time = record.time0;
			for (const gap of record.dt) {
				time += gap;
				if (!Number.isSafeInteger(time)) throw new TypeError(`${label} member times must stay safe integers`);
			}
		}
		function stringArray(value, label) {
			if (!Array.isArray(value) || value.some((member) => typeof member !== "string")) throw new TypeError(`${label} must be a string array`);
			return value;
		}
		function exactKeys(record, keys, label) {
			if (Object.keys(record).length !== keys.length || !keys.every((key) => Object.hasOwn(record, key))) throw new TypeError(`${label} Assistant stream record must contain exactly ${keys.join(", ")}`);
		}
		/** Web presentation fold joining transient Assistant frames to one durable v2 settlement. */
		/** Keeps transient Assistant presentation behind one settlement-aware interface. */
		var ClientAssistantStream = class {
			activeAttempt;
			pending = /* @__PURE__ */ new Map();
			publishedSeqs = /* @__PURE__ */ new Set();
			durableCursor = -1;
			transientInGap = 0;
			/**
			* Replace the durable Web window and adopt an optional reconnect baseline.
			* @param entries - durable entries in the replacement window.
			* @param baseline - compact prefix for an Assistant attempt that is still live.
			* @returns immediately visible durable entries plus reconstructed transient chunks.
			*/
			replace(entries, baseline) {
				this.pending.clear();
				this.transientInGap = 0;
				this.activeAttempt = void 0;
				const opening = baseline?.activeAttempt;
				if (opening !== void 0) this.activeAttempt = {
					attemptId: opening.attemptId,
					startedAfterSeq: opening.startedAfterSeq,
					turn: opening.turn,
					step: opening.step,
					nextIndex: opening.nextIndex
				};
				const visible = [...entries];
				this.publishedSeqs = new Set(visible.map((entry) => entry.event.seq));
				this.durableCursor = visible.reduce((cursor, entry) => Math.max(cursor, entry.event.seq), -1);
				if (opening !== void 0) for (const [index, member] of expandAssistantStream(opening.stream).entries()) {
					this.transientInGap += 1;
					visible.push({
						type: "transient",
						event: {
							type: "assistant/live-chunk",
							seq: this.durableCursor + 1 - 1 / (this.transientInGap + 1),
							time: member.time,
							data: {
								attemptId: opening.attemptId,
								turn: opening.turn,
								step: opening.step,
								chunk: member.chunk
							}
						}
					});
					if (index + 1 >= opening.nextIndex) break;
				}
				return visible;
			}
			/**
			* Stage one durable v2 settlement while its matching live attempt is open.
			* @param entry - newly followed durable entry.
			* @returns a publication decision, or `undefined` when no entry becomes visible.
			*/
			acceptDurable(entry) {
				const event = entry.event;
				this.durableCursor = Math.max(this.durableCursor, event.seq);
				this.transientInGap = 0;
				const settlement = assistantSettlementEntry(entry);
				if (settlement !== void 0 && this.attemptForSettlement(settlement.event) !== void 0) {
					if (this.pending.has(event.seq)) return { type: "rebaseline" };
					this.pending.set(event.seq, settlement);
					return;
				}
				return this.publish(entry);
			}
			/**
			* Fold one dense transient frame and release its named durable settlement.
			* @param frame - next Assistant stream frame received by the follow connection.
			* @returns a transient, publication, or rebaseline decision, or `undefined` when no entry becomes visible.
			*/
			acceptFrame(frame) {
				switch (frame.type) {
					case "start":
						if (this.activeAttempt !== void 0 || this.pending.size > 0) return { type: "rebaseline" };
						this.pending.clear();
						this.activeAttempt = {
							attemptId: frame.attemptId,
							startedAfterSeq: frame.startedAfterSeq,
							turn: frame.turn,
							step: frame.step,
							nextIndex: 0
						};
						return;
					case "chunk": {
						const attempt = this.activeAttempt;
						if (attempt === void 0 || attempt.attemptId !== frame.attemptId) return void 0;
						if (frame.index !== attempt.nextIndex) return { type: "rebaseline" };
						attempt.nextIndex += 1;
						this.transientInGap += 1;
						return {
							type: "transient",
							entry: {
								type: "transient",
								event: {
									type: "assistant/live-chunk",
									seq: this.durableCursor + 1 - 1 / (this.transientInGap + 1),
									time: frame.time,
									data: {
										attemptId: frame.attemptId,
										turn: attempt.turn,
										step: attempt.step,
										chunk: frame.chunk
									}
								}
							}
						};
					}
					case "end": {
						const attempt = this.activeAttempt;
						if (attempt === void 0 || attempt.attemptId !== frame.attemptId) return;
						this.activeAttempt = void 0;
						if (frame.index !== attempt.nextIndex) return { type: "rebaseline" };
						if (frame.outcome.kind === "abandoned") return this.pending.size === 0 ? {
							type: "abandonment",
							attemptId: attempt.attemptId
						} : { type: "rebaseline" };
						if (this.publishedSeqs.has(frame.outcome.seq)) return void 0;
						const entry = this.pending.get(frame.outcome.seq);
						if (entry === void 0 || entry.event.type !== frame.outcome.eventType) return { type: "rebaseline" };
						this.pending.delete(frame.outcome.seq);
						this.publishedSeqs.add(entry.event.seq);
						return {
							type: "settlement",
							attemptId: attempt.attemptId,
							entry
						};
					}
				}
			}
			attemptForSettlement(event) {
				const attempt = this.activeAttempt;
				if (attempt === void 0 || event.type === "assistant/message" && event.surfaceOp !== "append" || event.seq <= attempt.startedAfterSeq || attempt.turn !== event.data.turn || attempt.step !== event.data.step) return void 0;
				return attempt;
			}
			publish(entry) {
				this.publishedSeqs.add(entry.event.seq);
				return {
					type: "publish",
					entry
				};
			}
		};
		function assistantSettlementEntry(entry) {
			return entry.event.type === "assistant/message" || entry.event.type === "assistant/attempt" ? entry : void 0;
		}
		function projectionsBaseline(value) {
			return {
				...value,
				asOfSeq: value.asOfSeq === -1 ? -1 : SessionSeq(value.asOfSeq)
			};
		}
		/**
		* Owns a session's event window, lifecycle state, and observable
		* snapshot. React bindings remain outside this data layer. Features see only
		* the {@link SessionFace} slice (ISession verbs + the snapshot source); the
		* remaining public members are Session Controller internals.
		*/
		var Session = class {
			sessionId;
			remote;
			options;
			baseSeq = SessionLogOffset(0);
			hasMore = false;
			openState = "cold";
			openError = null;
			openPromise = null;
			/** Bumped by stream replacement to invalidate an in-flight doOpen. Stale
			*  passes drop all writes once the generation moves on. */
			openGeneration = 0;
			loadingOlder = false;
			/** Shared low-water target of the running jump loop; null when no jump is paging. */
			jumpTargetSeq = null;
			/** The running jump loop's completion, shared by retargeting callers. */
			jumpPromise = null;
			/** Authoritative stream-only inbox snapshot; pending work never hits history. */
			queueMirror = new SessionQueueMirror();
			assistantStream = new ClientAssistantStream();
			running = false;
			address;
			parentAvailable;
			/**
			* Sticky send marker, private input of the composerPhase derivation: set
			* synchronously before prompt()'s first await, never reset — the blank →
			* engaging edge of the phase machine (see ComposerPhase).
			*/
			promptAttempted = false;
			/** A first accepted prompt stays in the engaging phase until its turn is observable. */
			firstPromptPendingTurn = false;
			/** Empty-log mirror (see ConversationSnapshot.blank); unknown bare sessions begin conservatively blank. */
			blankBit = true;
			removed = false;
			promptError = null;
			lastAgentError = null;
			/** Local submission echoes, insertion-ordered (see SessionSnapshot.pendingSubmissions). */
			pendingSubmissions = [];
			/** Per-echo settlement state; `retiring` latches the first observation so a
			*  queue frame and its durable event cannot both retire one echo. */
			submissionSettlements = /* @__PURE__ */ new Map();
			/** Owns the addressed page/follow lifecycle while this Session is open. */
			events;
			/**
			* Per-session projection value store (push model; see the session-projection
			* subsystem page, docs/subsystems/session-projection.md): finished whole
			* values computed on the Host, seeded by the tail page's
			* projections block and updated by Session Controller control frames under the
			* one higher-seq-wins rule. Keys are read via `projections.faceOf(key)`
			* (the useProjection resolution face); the conversation snapshot never
			* carries projection values, and no client-side domain folding exists.
			* Manager-owned when constructed through SessionManager (frames route and
			* the store outlives instantiation, the title-snapshot precedent); a bare
			* construction gets a private store.
			*/
			projections;
			/** Contiguous history and live tail consumed by Conversation assembly. */
			eventSource = new MutableSessionEventSource();
			snapshotCache;
			notifier;
			/**
			* Agent-scoped cordis context, bound once by ClientSessions when it
			* mints the scope (the client mirror of the host Agent's loopCtx). The
			* Session dispatches its own scoped events through it; undefined means
			* unbound (bare object-layer construction) or already pruned — both skip
			* dispatch-dependent behavior rather than fail.
			*/
			actx;
			/**
			* @param sessionId - Host session identity (client sessions are always Host-born).
			* @param remote - generated Remote namespaces this session calls.
			* @param options - optional manager-owned state observers.
			*/
			constructor(sessionId, remote, options = {}) {
				this.sessionId = sessionId;
				this.remote = remote;
				this.options = options;
				this.projections = options.projections ?? new ProjectionValueStore();
				this.address = options.address;
				this.parentAvailable = options.parentAvailable;
				this.notifier = new Notifier(() => {
					this.snapshotCache = this.buildSnapshot();
				});
				this.snapshotCache = this.buildSnapshot();
			}
			/**
			* Bind the Agent-scoped context minted by ClientSessions (single write;
			* a second bind is a wiring error and throws). Direction stays one-way at
			* this binding boundary: consumers still reach the Session via `sessions.sessionOf`,
			* while the Session holds its own dispatch point (host Agent.loopCtx
			* mirror).
			* @param actx - the agent's scoped context.
			*/
			bindScope(actx) {
				if (this.actx !== void 0) throw new Error(`session ${this.sessionId} already has a bound scope`);
				this.actx = actx;
			}
			/** Release the bound scope at prune time (a later rebind accompanies a freshly minted scope). */
			unbindScope() {
				this.actx = void 0;
			}
			/**
			* Register one local submission echo (see the ISession declaration).
			* Synchronous through markDirty: the echo is in the very next snapshot, so
			* the conversation can paint it before the caller starts serializing.
			* @param input - echo content and the optional settlement callback.
			* @returns the minted identity for {@link prompt} plus the pre-prompt abandon path.
			*/
			beginSubmission(input) {
				const requestId = randomUUID();
				this.pendingSubmissions = [...this.pendingSubmissions, {
					requestId,
					placement: this.running ? input.mode === "steer" ? "steering" : "queued" : "transcript",
					time: Date.now(),
					text: input.text,
					attachments: input.attachments
				}];
				this.submissionSettlements.set(requestId, {
					onRetire: input.onRetire,
					retiring: false
				});
				this.promptAttempted = true;
				this.notifier.markDirty();
				return {
					requestId,
					abandon: () => {
						this.retireFailedSubmission(requestId);
					}
				};
			}
			/**
			* Send (queue/steer passed through 1:1); failures land in the snapshot's promptError.
			* @param content - text, browser-owned temporary image uploads, and staged-file receipts.
			* @param mode - queue appends after the current turn; steer interrupts it.
			* @param signal - optional caller cancellation for the complete admission round-trip.
			* @param requestId - identity from {@link beginSubmission}; a failed identified prompt retires its echo.
			* @returns the prompt result (also mirrored into promptError on failure).
			*/
			async prompt(content, mode, signal, requestId) {
				this.promptError = null;
				this.lastAgentError = null;
				this.promptAttempted = true;
				if (this.blankBit) this.firstPromptPendingTurn = true;
				this.notifier.markDirty();
				let result;
				if (this.address === void 0) {
					const clientTimeZone = resolvedClientTimeZone();
					result = await this.remote.session.prompt({
						requestId: requestId ?? randomUUID(),
						sessionId: this.sessionId,
						mode,
						content,
						clientTimeZone
					}, signal);
				} else if (content.some((part) => part.type === "file")) result = {
					ok: false,
					error: new RemoteError("subagent/attachment-invalid", "subagent continuation does not accept files", { reason: "SUBAGENT_FILE_UNSUPPORTED" })
				};
				else {
					const routedContent = content;
					const routed = await this.remote.subagents.prompt({
						requestId: randomUUID(),
						parentSessionId: this.address.parentSessionId,
						childSessionId: this.address.childSessionId,
						mode: "continuable",
						delivery: mode,
						content: routedContent,
						clientTimeZone: resolvedClientTimeZone()
					}, signal);
					result = routed.ok ? {
						ok: true,
						value: { accepted: true }
					} : routed;
				}
				if (!result.ok) {
					if (requestId !== void 0) this.retireFailedSubmission(requestId);
					this.promptError = {
						op: "send",
						error: result.error
					};
					this.notifier.markDirty();
					return result;
				}
				if (this.blankBit) {
					this.blankBit = false;
					this.options.onEngaged?.(this);
					this.notifier.markDirty();
				}
				return result;
			}
			/**
			* Resolve one image referenced by this session into browser-consumable bytes.
			* @param attachmentId - opaque id found in the folded session log.
			* @returns the authenticated reference and decoded bytes.
			*/
			async readAttachment(attachmentId) {
				const result = await this.remote.session.attachment({
					sessionId: this.sessionId,
					attachmentId
				});
				if (!result.ok) return result;
				const binary = atob(result.value.data);
				const data = Uint8Array.from(binary, (char) => char.charCodeAt(0));
				return {
					ok: true,
					value: {
						attachment: result.value.attachment,
						data
					}
				};
			}
			/** Apply one operation to a still-pending queue occurrence. */
			async updateQueue(itemId, action) {
				return this.remote.session.updateQueue({
					sessionId: this.sessionId,
					itemId,
					action
				});
			}
			/**
			* Stop the active turn while the Host preserves pending inbox work; failures
			* land in promptError (same error-strip display slot). A subagent address
			* routes through `subagents.interruptByParent`, whose durable parent-address
			* authority works without a live parent Agent.
			* @returns the cancel result.
			*/
			async cancel() {
				const address = this.address;
				const result = address !== void 0 ? await this.remote.subagents.interruptByParent(address.childSessionId, address.parentSessionId, "continuable") : await this.remote.session.cancel({ sessionId: this.sessionId });
				if (!result.ok) {
					this.promptError = {
						op: "stop",
						error: result.error
					};
					this.notifier.markDirty();
				}
				return result;
			}
			/**
			* Rename: contract session.rename 1:1. On success settle the 'title'
			* projection cell from the response's `{title, seq}` under the store's
			* higher-seq-wins rule (the push frame arriving later is a no-op replay),
			* so the list row and any useProjection('title') reader update without
			* waiting for the control-stream projection update.
			* @param title - raw title text (the host normalizes acceptance).
			* @returns the rename result (normalized accepted title + title event seq).
			*/
			async rename(title) {
				const result = await this.remote.session.rename({
					sessionId: this.sessionId,
					title
				});
				if (!result.ok) return result;
				const seq = SessionSeq(result.value.seq);
				this.projections.apply("title", result.value.title, seq);
				return {
					ok: true,
					value: {
						title: result.value.title,
						seq
					}
				};
			}
			/**
			* Execute one slash-command line against this session's agent — pure
			* admission semantics (the host executor durably logs the lifecycle;
			* outcomes render as flow nodes, never as a response echo).
			* @param line - the full command line, leading slash included.
			* @returns the admission result.
			*/
			async command(line) {
				const result = await this.remote.commands.execute(this.sessionId, line, []);
				if (!result.ok) return result;
				return {
					ok: true,
					value: { matched: result.value !== void 0 }
				};
			}
			/** First open: pull the tail page (idempotent — in-flight/already-open returns the existing promise). */
			open() {
				if (this.openState === "open") return Promise.resolve();
				if (this.openPromise !== null) return this.openPromise;
				const promise = this.doOpen(this.openGeneration).finally(() => {
					if (this.openPromise === promise) this.openPromise = null;
				});
				this.openPromise = promise;
				return promise;
			}
			/** Page up: pull one earlier page with the window's first seq as beforeSeq and prepend. */
			async loadOlder() {
				if (this.openState !== "open" || !this.hasMore || this.loadingOlder) return;
				const events = this.events;
				if (events === void 0) return;
				this.loadingOlder = true;
				this.notifier.markDirty();
				try {
					await events.prepend({
						beforeSeq: this.baseSeq,
						maxMessages: 50
					});
				} catch (error) {
					if (!(0, _deepseek_ai_dsh_api_gateway_client.isRemoteFailure)(error)) console.error("[session-controller] loadOlder failed:", error);
				} finally {
					this.loadingOlder = false;
					this.notifier.markDirty();
				}
			}
			/** Jump loader: page backwards until the window covers seq (see ISession.loadThrough). */
			loadThrough(seq) {
				if (this.openState !== "open" || !this.hasMore || this.baseSeq <= seq) return Promise.resolve();
				if (this.jumpPromise !== null) {
					this.jumpTargetSeq = SessionSeq(Math.min(this.jumpTargetSeq ?? seq, seq));
					return this.jumpPromise;
				}
				if (this.loadingOlder) return Promise.resolve();
				this.jumpTargetSeq = seq;
				this.loadingOlder = true;
				this.notifier.markDirty();
				const generation = this.openGeneration;
				this.jumpPromise = (async () => {
					try {
						while (this.hasMore && this.jumpTargetSeq !== null && this.baseSeq > this.jumpTargetSeq) {
							if (generation !== this.openGeneration) return;
							const events = this.events;
							if (events === void 0) return;
							const before = this.baseSeq;
							await events.prepend({
								beforeSeq: this.baseSeq,
								maxMessages: 200
							});
							if (this.baseSeq >= before) return;
						}
					} catch (error) {
						if (!(0, _deepseek_ai_dsh_api_gateway_client.isRemoteFailure)(error)) console.error("[session-controller] loadThrough failed:", error);
					} finally {
						this.jumpTargetSeq = null;
						this.jumpPromise = null;
						this.loadingOlder = false;
						this.notifier.markDirty();
					}
				})();
				return this.jumpPromise;
			}
			/** Rebuild an opened history source after address replacement.
			*  Invalidates any in-flight open first; queue state belongs to the independently
			*  reconnecting control stream and remains untouched. */
			async resync() {
				if (this.openState === "cold") return;
				this.openGeneration++;
				const events = this.events;
				this.events = void 0;
				await events?.dispose();
				this.openPromise = null;
				this.openState = "cold";
				this.openError = null;
				this.baseSeq = SessionLogOffset(0);
				this.notifier.markDirty();
				await this.open();
			}
			/**
			* uSES subscription entry.
			* @param listener - change callback.
			* @returns the unsubscribe function.
			*/
			subscribe(listener) {
				return this.notifier.subscribe(listener);
			}
			/**
			* Cached Session snapshot (rebuilt lazily when dirty with no listeners).
			* @returns the cached reference (stable until the next flush).
			*/
			getSnapshot() {
				this.notifier.ensureFresh();
				return this.snapshotCache;
			}
			/**
			* Replace every transient control value for this Session from one stream baseline.
			* @param queue - complete pending queue for this Session.
			*/
			replaceControl(queue) {
				this.queueMirror.replace(queue);
				this.observeSubmissionQueue(queue);
				this.notifier.markDirty();
			}
			/**
			* Apply one Session-addressed live control update.
			* @param frame - queue replacement addressed to this Session.
			*/
			handleControlFrame(frame) {
				this.queueMirror.replace(frame.items);
				this.observeSubmissionQueue(frame.items);
				this.notifier.markDirty();
			}
			/**
			* Running-bit relay from the host stream (list entry and snapshot stay consistent).
			* @param running - the new running state.
			*/
			handleRunning(running) {
				if (running && this.blankBit) {
					this.blankBit = false;
					this.notifier.markDirty();
				}
				if (running) this.firstPromptPendingTurn = false;
				if (this.running === running) return;
				this.running = running;
				this.notifier.markDirty();
			}
			/**
			* Install or clear the catalog-discovered transport address. A changed
			* address rebuilds an already-open window through its new history route.
			* @param address - direct parent/child address, or undefined for ordinary transport.
			* @param parentAvailable - latest exact-parent availability hint, or undefined before a catalog read.
			*/
			configureSubagent(address, parentAvailable) {
				const same = this.address?.parentSessionId === address?.parentSessionId && this.address?.childSessionId === address?.childSessionId && this.address?.mode === address?.mode;
				this.address = address;
				this.parentAvailable = parentAvailable;
				if (!same && this.openState !== "cold") this.resync();
				else this.notifier.markDirty();
			}
			/**
			* Update only the parent availability hint from a catalog refresh.
			* @param available - whether the exact direct parent is live.
			*/
			handleSubagentParentAvailable(available) {
				if (this.parentAvailable === available) return;
				this.parentAvailable = available;
				this.notifier.markDirty();
			}
			/**
			* Blank-bit relay from the authoritative summary source (`session.list` and
			* `api-session/added`). Monotone: once any signal (local first send,
			* running flip, an earlier summary) cleared it, a stale true never
			* re-blanks.
			* @param blank - the summary's derived empty-log bit.
			*/
			handleBlank(blank) {
				if (blank === this.blankBit) return;
				if (blank && (this.promptAttempted || this.running)) return;
				this.blankBit = blank;
				this.notifier.markDirty();
			}
			/** `api-session/removed` relay: flag the snapshot while retaining the resident instance. */
			handleRemoved() {
				this.removed = true;
				this.notifier.markDirty();
			}
			/**
			* `api-session/error` relay: the outlet for live failures with no turn position.
			* @param message - the stringified error.
			*/
			handleAgentError(message) {
				this.lastAgentError = message;
				this.notifier.markDirty();
			}
			/**
			* Stop the Session's live Remote source.
			* @returns when the Remote iterator has completed teardown.
			*/
			async dispose() {
				for (const requestId of [...this.submissionSettlements.keys()]) this.retireFailedSubmission(requestId);
				this.openGeneration++;
				const events = this.events;
				this.events = void 0;
				await events?.dispose();
			}
			/** @param generation - openGeneration at launch; stale passes cannot publish after replacement. */
			async doOpen(generation) {
				this.openState = "loading";
				this.openError = null;
				this.notifier.markDirty();
				const events = new SessionEventStream(this.remote, this.sessionAddress(), {
					publish: (change) => {
						if (generation !== this.openGeneration || this.events !== events) return;
						this.acceptEventChange(change);
					},
					failed: (error) => {
						this.failEventStream(events, generation, error);
					}
				});
				this.events = events;
				try {
					await events.open({ maxMessages: 50 });
					if (generation !== this.openGeneration || this.events !== events) return;
					this.openState = "open";
				} catch (error) {
					if (generation !== this.openGeneration || this.events !== events) return;
					if (!(0, _deepseek_ai_dsh_api_gateway_client.isRemoteFailure)(error)) throw error;
					this.events = void 0;
					this.openState = "error";
					this.openError = error;
				} finally {
					if (generation === this.openGeneration) this.notifier.markDirty();
				}
			}
			/** Apply one contiguous journal update already reconciled by the Remote stream. */
			acceptEventChange(change) {
				switch (change.type) {
					case "replace":
						this.installWindow(change.entries, change.hasMore, change.page.projections === void 0 ? void 0 : projectionsBaseline(change.page.projections), change.page.assistantStream);
						return;
					case "prepend":
						this.prependWindow(change.entries, change.hasMore);
						return;
					case "append":
						this.publishAssistantEntry(this.assistantStream.acceptDurable(change.entry));
						return;
					case "assistant-stream": this.publishAssistantEntry(this.assistantStream.acceptFrame(change.frame));
				}
			}
			/** Replace the complete contiguous window and apply page-owned projection metadata. */
			installWindow(entries, hasMore, projections, assistantStream) {
				const visible = this.assistantStream.replace(entries, assistantStream);
				this.baseSeq = SessionLogOffset(entries[0]?.event.seq ?? 0);
				this.hasMore = hasMore;
				if (visible.some((entry) => entry.event.type === "turn/start")) this.firstPromptPendingTurn = false;
				if (projections !== void 0) this.projections.seed(projections);
				this.eventSource.replace(visible, hasMore);
				for (const entry of visible) this.observeSubmissionEvent(entry.event);
				this.notifier.markDirty();
			}
			publishAssistantEntry(result) {
				if (result?.type === "rebaseline") {
					const events = this.events;
					queueMicrotask(() => {
						if (events !== void 0 && this.events === events) events.restart();
					});
					return;
				}
				if (result?.type === "settlement") {
					this.eventSource.settleAssistant(result.attemptId, result.entry);
					this.observeSubmissionEvent(result.entry.event);
					this.notifier.markDirty();
					return;
				}
				if (result?.type === "abandonment") {
					this.eventSource.settleAssistant(result.attemptId);
					this.notifier.markDirty();
					return;
				}
				if (result?.type === "publish" && this.appendLive(result.entry)) this.notifier.markDirty();
				else if (result?.type === "transient") {
					this.eventSource.append(result.entry);
					this.notifier.markDirty();
				}
			}
			/** Prepend one stream-validated history page. */
			prependWindow(entries, hasMore) {
				this.baseSeq = entries[0] === void 0 ? this.baseSeq : SessionLogOffset(entries[0].event.seq);
				this.hasMore = hasMore;
				this.eventSource.prepend(entries, hasMore);
			}
			/** Append one stream-validated live event. */
			appendLive(entry) {
				const event = entry.event;
				const awaitingFirstTurn = this.firstPromptPendingTurn;
				if (event.type === "turn/start") this.firstPromptPendingTurn = false;
				const queueChanged = this.queueMirror.acceptDurable(event);
				this.eventSource.append(entry);
				this.observeSubmissionEvent(event);
				return queueChanged || awaitingFirstTurn !== this.firstPromptPendingTurn;
			}
			/** Retire the matching echo when a durable browser-prompt `user/message` becomes visible. */
			observeSubmissionEvent(event) {
				if (this.submissionSettlements.size === 0 || event.type !== "user/message") return;
				const data = event.data;
				const source = data?.source;
				if (source?.kind !== "user" || typeof source.rpcId !== "string") return;
				this.scheduleObservedRetirement(source.rpcId, attachmentRefsIn(data?.content));
			}
			/** Retire echoes whose prompts landed in the host inbox instead of the log (running-turn submissions). */
			observeSubmissionQueue(items) {
				if (this.submissionSettlements.size === 0) return;
				for (const item of items) if (item.rpcId !== void 0) this.scheduleObservedRetirement(item.rpcId, attachmentRefsIn(item.message.content));
			}
			/**
			* Latch one observed settlement and remove the echo an animation frame
			* later. The delay keeps the echo in the snapshot until the frame in which
			* the durable node (whose assembly frame was registered first) is
			* renderable; the render-time rpcId dedupe hides the one-frame overlap.
			*/
			scheduleObservedRetirement(requestId, attachments) {
				const settlement = this.submissionSettlements.get(requestId);
				if (settlement === void 0 || settlement.retiring) return;
				settlement.retiring = true;
				scheduleFrame(() => {
					this.finishSubmission(requestId, {
						reason: "observed",
						attachments
					});
				});
			}
			/** Remove one unsettled echo immediately (prompt rejection, abort, or disposal). */
			retireFailedSubmission(requestId) {
				const settlement = this.submissionSettlements.get(requestId);
				if (settlement === void 0 || settlement.retiring) return;
				settlement.retiring = true;
				this.finishSubmission(requestId, { reason: "failed" });
			}
			/** Single removal point: drop the echo, publish, then notify the owner. */
			finishSubmission(requestId, retirement) {
				const settlement = this.submissionSettlements.get(requestId);
				/* v8 ignore next -- retiring latches before every schedule, so one settlement never finishes twice. */
				if (settlement === void 0) return;
				this.submissionSettlements.delete(requestId);
				this.pendingSubmissions = this.pendingSubmissions.filter((echo) => echo.requestId !== requestId);
				this.notifier.markDirty();
				settlement.onRetire?.(retirement);
			}
			/** Publish a terminal background failure only while this stream still owns the Session. */
			failEventStream(events, generation, error) {
				if (generation !== this.openGeneration || this.events !== events) return;
				if (!(0, _deepseek_ai_dsh_api_gateway_client.isRemoteFailure)(error)) throw error;
				this.openGeneration++;
				this.events = void 0;
				this.openPromise = null;
				this.openState = "error";
				this.openError = error;
				events.dispose();
				this.notifier.markDirty();
			}
			buildSnapshot() {
				return {
					sessionId: this.sessionId,
					queue: this.queueMirror.snapshot(),
					pendingSubmissions: this.pendingSubmissions,
					running: this.running,
					subagent: this.address === void 0 ? null : {
						address: this.address,
						...this.parentAvailable === void 0 ? {} : { parentAvailable: this.parentAvailable }
					},
					removed: this.removed,
					openState: this.openState,
					openError: this.openError,
					hasMore: this.hasMore,
					loadingOlder: this.loadingOlder,
					promptError: this.promptError,
					blank: this.blankBit,
					lastAgentError: this.lastAgentError,
					promptAttempted: this.promptAttempted,
					awaitingFirstTurn: this.firstPromptPendingTurn
				};
			}
			sessionAddress() {
				return this.address === void 0 ? {
					kind: "session",
					sessionId: this.sessionId
				} : {
					kind: "subagent",
					...this.address
				};
			}
		};
		/** Run one callback on the next animation frame, or a macrotask where no frame clock exists. */
		function scheduleFrame(fn) {
			if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => {
				fn();
			});
			else setTimeout(fn, 0);
		}
		/** Attachment references in one structurally-read content block list, in block order. */
		function attachmentRefsIn(content) {
			if (!Array.isArray(content)) return [];
			const refs = [];
			for (const block of content) {
				if (typeof block !== "object" || block === null) continue;
				const candidate = block;
				if ((candidate.type === "image" || candidate.type === "file") && typeof candidate.attachment === "object" && candidate.attachment !== null) refs.push(candidate.attachment);
			}
			return refs;
		}
		function sessionSeqCursor(value) {
			return value === -1 ? -1 : SessionSeq(value);
		}
		function catalogAvailability(parentAvailable) {
			return parentAvailable === void 0 ? {} : { parentAvailable };
		}
		/** Instance cluster + frame entry + the session list. */
		var SessionManager = class {
			remote;
			sessions = /* @__PURE__ */ new Map();
			/** In-flight Session disposals remain here after instances leave `sessions`, so manager disposal can await quiescence. */
			sessionDisposals = /* @__PURE__ */ new Set();
			/** Latest transient queues, retained independently of Session object materialization. */
			queues = /* @__PURE__ */ new Map();
			/**
			* Sessions that finished running while not selected — the sidebar's green
			* "done" reminder (manager-owned, survives connection generations; cleared
			* on select and session-removed, re-armed by the next completion).
			*/
			completedNotifications = /* @__PURE__ */ new Set();
			/** Last-observed running bits per session; the true→false edge here arms {@link completedNotifications}. */
			prevRunning = /* @__PURE__ */ new Map();
			/** Per-session projection value stores, retained independently of instance arrival (the
			*  title-snapshot precedent, generalized): push frames land here whether or not the Session
			*  is instantiated (list rows read the 'title' key), and an instantiated Session adopts the
			*  same store so history-baseline seeding and frames converge on one row set. */
			projectionStores = /* @__PURE__ */ new Map();
			summaries = [];
			listState = "idle";
			/** Arrival phase; the pending → ready edge fires on the first successful pull (see SessionListPhase). */
			listPhase = "pending";
			listError = null;
			listInflight = null;
			/** Mutations arriving after a list request starts are replayed over its response. */
			listMutations = null;
			addresses = /* @__PURE__ */ new Map();
			catalogs = /* @__PURE__ */ new Map();
			catalogInflight = /* @__PURE__ */ new Map();
			/** Catalog owners whose membership changed while a pull was in flight: one trailing refresh after it settles. */
			catalogStale = /* @__PURE__ */ new Set();
			openCatalogs = /* @__PURE__ */ new Set();
			catalogDebounce = /* @__PURE__ */ new Map();
			/**
			* Background jobs per session, last-wins from Session Controller's control
			* stream. An empty set is stored as an absent key, so absence and `[]` are
			* one representation.
			*/
			jobsBySession = /* @__PURE__ */ new Map();
			selected;
			listSnapshotCache;
			/** Entry-identity cache (reference stability): list rebuilds reuse the previous entry
			*  object when every field matches — wire refreshes mint all-new summary objects, so identity
			*  must be recovered by value or every SessionListItem memo misses on every refresh. */
			entryCache = /* @__PURE__ */ new Map();
			itemsCache = [];
			notifier = new Notifier(() => {
				this.listSnapshotCache = this.buildListSnapshot();
			});
			/**
			* @param remote - generated Remote namespaces the Session cluster calls.
			* @param restoredSelection - persisted real-Session selection candidate.
			*/
			constructor(remote, restoredSelection, restoredAddress) {
				this.remote = remote;
				this.selected = restoredSelection;
				if (restoredAddress !== void 0) this.addresses.set(restoredAddress.childSessionId, restoredAddress);
				this.listSnapshotCache = this.buildListSnapshot();
			}
			/**
			* Select a listed Session or a retained catalog-addressed child.
			* @param sessionId - listed or catalog-addressed Session id.
			*/
			select(sessionId) {
				const address = this.navigationAddress(sessionId);
				if (!this.summaries.some((summary) => summary.sessionId === sessionId) && address === void 0) throw new Error(`sessions.select: unknown session ${sessionId}`);
				if (address !== void 0) this.addresses.set(sessionId, address);
				this.sessions.get(sessionId)?.configureSubagent(address, address === void 0 ? void 0 : this.catalogs.get(address.parentSessionId)?.parentAvailable);
				this.selected = sessionId;
				this.completedNotifications.delete(sessionId);
				this.refreshSubagents(sessionId);
				this.notifier.notifyNow();
			}
			/**
			* Select a healthy child through its durable direct-parent address.
			* @param address - catalog-derived parent and child ids.
			*/
			selectSubagent(address) {
				const catalog = this.catalogs.get(address.parentSessionId);
				const entry = catalog?.entries.find((candidate) => candidate.id === address.childSessionId);
				if (entry === void 0 || entry.kind !== "child" || entry.mode !== address.mode) throw new Error(`sessions.selectSubagent: ${address.childSessionId} is not a healthy catalog child`);
				this.addresses.set(address.childSessionId, address);
				this.sessions.get(address.childSessionId)?.configureSubagent(address, catalog?.parentAvailable);
				this.selected = address.childSessionId;
				this.completedNotifications.delete(address.childSessionId);
				this.refreshSubagents(address.childSessionId);
				this.notifier.notifyNow();
			}
			/** Clear the selection (the layout falls to the no-session view state). */
			clearSelection() {
				this.selected = void 0;
				this.notifier.notifyNow();
			}
			/**
			* Return the durable catalog address retained for one child.
			* @param sessionId - possible addressed child id.
			* @returns The direct-parent address, when navigation discovered one.
			*/
			subagentAddress(sessionId) {
				return this.addresses.get(sessionId);
			}
			/**
			* Resolve an address for breadcrumb navigation without retaining transport authority.
			* @param sessionId - possible child id in an already-loaded catalog.
			* @returns A retained or catalog-derived direct-parent address.
			*/
			navigationAddress(sessionId) {
				const retained = this.addresses.get(sessionId);
				if (retained !== void 0) return retained;
				for (const [parentSessionId, catalog] of this.catalogs) {
					const child = catalog.entries.find((entry) => entry.kind === "child" && entry.id === sessionId);
					if (child?.kind === "child") return {
						parentSessionId,
						childSessionId: sessionId,
						mode: child.mode
					};
				}
			}
			/**
			* Drop a session instance (scope-prune companion: instance
			* and scope share one lifecycle). The host session log is the durable
			* truth — a later get() lazily rebuilds and open() backfills history.
			* @param sessionId - the session to drop.
			*/
			async drop(sessionId) {
				const session = this.sessions.get(sessionId);
				this.sessions.delete(sessionId);
				if (session !== void 0) await this.startSessionDisposal(session);
			}
			/**
			* Stop owned timers and every remaining Session instance.
			* @returns when every Session Remote iterator has completed teardown.
			*/
			async dispose() {
				for (const timer of this.catalogDebounce.values()) clearTimeout(timer);
				this.catalogDebounce.clear();
				this.catalogStale.clear();
				this.openCatalogs.clear();
				const sessions = [...this.sessions.values()];
				this.sessions.clear();
				for (const session of sessions) this.startSessionDisposal(session);
				await this.drainSessionDisposals();
			}
			startSessionDisposal(session) {
				const disposal = session.dispose();
				this.sessionDisposals.add(disposal);
				disposal.then(() => {
					this.sessionDisposals.delete(disposal);
				}, () => {
					this.sessionDisposals.delete(disposal);
				});
				return disposal;
			}
			async drainSessionDisposals() {
				while (this.sessionDisposals.size > 0) await Promise.allSettled([...this.sessionDisposals]);
			}
			/**
			* Lazy build: return the existing instance or construct one (no auto-open —
			* open is triggered by the container's select callback).
			* @param sessionId - the session to get.
			* @returns the resident instance.
			*/
			get(sessionId) {
				let session = this.sessions.get(sessionId);
				if (session === void 0) {
					session = this.createSession(sessionId);
					this.sessions.set(sessionId, session);
					session.replaceControl(this.queues.get(sessionId) ?? []);
					const summary = this.summaries.find((s) => s.sessionId === sessionId);
					if (summary !== void 0) {
						session.handleBlank(summary.blank);
						session.handleRunning(summary.running);
					} else {
						const address = this.addresses.get(sessionId);
						const child = address === void 0 ? void 0 : this.catalogs.get(address.parentSessionId)?.entries.find((entry) => entry.kind === "child" && entry.id === sessionId);
						if (child?.kind === "child") {
							session.handleBlank(false);
							session.handleRunning(child.activity === "running");
						}
					}
				}
				return session;
			}
			createSession(sessionId) {
				const address = this.addresses.get(sessionId);
				const parentAvailable = address === void 0 ? void 0 : this.catalogs.get(address.parentSessionId)?.parentAvailable;
				return new Session(sessionId, this.remote, {
					...address === void 0 ? {} : {
						address,
						...catalogAvailability(parentAvailable)
					},
					onEngaged: (engaged) => {
						this.recordMutation({
							kind: "engaged",
							sessionId: engaged.sessionId
						});
					},
					projections: this.projectionStore(sessionId)
				});
			}
			/** Resident per-session projection store (create-on-demand; outlives instantiation). */
			projectionStore(sessionId) {
				let store = this.projectionStores.get(sessionId);
				if (store === void 0) {
					store = new ProjectionValueStore();
					store.subscribeAny(() => {
						this.notifier.markDirty();
					});
					this.projectionStores.set(sessionId, store);
				}
				return store;
			}
			/**
			* Refresh one direct-child catalog, reusing its in-flight request.
			* @param parentSessionId - catalog owner.
			*/
			refreshSubagents(parentSessionId) {
				const existing = this.catalogInflight.get(parentSessionId);
				if (existing !== void 0) return existing.promise;
				const previous = this.catalogs.get(parentSessionId);
				const expandableRows = /* @__PURE__ */ new Set();
				const activityRows = /* @__PURE__ */ new Map();
				this.catalogs.set(parentSessionId, {
					entries: previous?.entries ?? [],
					...previous?.parentAvailable === void 0 ? {} : { parentAvailable: previous.parentAvailable },
					state: "loading",
					error: null
				});
				this.notifier.markDirty();
				const operation = (async () => {
					try {
						const result = await this.remote.subagents.list(parentSessionId);
						if (result.ok) {
							const parentAvailable = this.catalogInflight.get(parentSessionId)?.parentAvailableOverride ?? result.value.parentAvailable;
							this.catalogs.set(parentSessionId, {
								...result.value,
								entries: this.withCatalogMutations(result.value.entries, expandableRows, activityRows),
								parentAvailable,
								state: "ready",
								error: null
							});
							for (const [childId, address] of this.addresses) {
								if (address.parentSessionId !== parentSessionId) continue;
								this.sessions.get(childId)?.handleSubagentParentAvailable(parentAvailable);
							}
						} else this.catalogs.set(parentSessionId, {
							entries: this.withCatalogMutations(previous?.entries ?? [], expandableRows, activityRows),
							...catalogAvailability(this.catalogInflight.get(parentSessionId)?.parentAvailableOverride ?? previous?.parentAvailable),
							state: "error",
							error: result.error
						});
					} catch (error) {
						if (!(0, _deepseek_ai_dsh_api_gateway_client.isRemoteFailure)(error)) throw error;
						this.catalogs.set(parentSessionId, {
							entries: this.withCatalogMutations(previous?.entries ?? [], expandableRows, activityRows),
							...catalogAvailability(this.catalogInflight.get(parentSessionId)?.parentAvailableOverride ?? previous?.parentAvailable),
							state: "error",
							error
						});
					} finally {
						this.catalogInflight.delete(parentSessionId);
						if (this.catalogStale.delete(parentSessionId)) this.refreshSubagents(parentSessionId);
						this.notifier.markDirty();
					}
				})();
				this.catalogInflight.set(parentSessionId, {
					promise: operation,
					expandableRows,
					activityRows,
					parentAvailableOverride: void 0
				});
				return operation;
			}
			/**
			* Mark whether a catalog menu is consuming live membership updates.
			* @param parentSessionId - catalog owner.
			* @param open - current menu state.
			*/
			setSubagentCatalogOpen(parentSessionId, open) {
				if (open) {
					this.openCatalogs.add(parentSessionId);
					this.refreshSubagents(parentSessionId);
				} else {
					this.openCatalogs.delete(parentSessionId);
					const timer = this.catalogDebounce.get(parentSessionId);
					if (timer !== void 0) {
						clearTimeout(timer);
						this.catalogDebounce.delete(parentSessionId);
					}
				}
			}
			/** Full refresh via session.list (single-flight: an in-flight call is reused). */
			refreshList() {
				if (this.listInflight !== null) return this.listInflight;
				this.listState = "loading";
				this.listError = null;
				const established = this.summaries;
				const mutations = [];
				this.listMutations = mutations;
				this.notifier.markDirty();
				this.listInflight = (async () => {
					try {
						const result = await this.remote.session.list({});
						if (result.ok) {
							const baseline = this.listPhase === "pending" ? [...result.value.items] : mergeOrderedBaseline(established, result.value.items, (summary) => summary.sessionId);
							for (const s of baseline) if (!this.prevRunning.has(s.sessionId)) this.prevRunning.set(s.sessionId, s.running);
							let summaries = baseline;
							for (const mutation of mutations) {
								summaries = applyMutation(summaries, mutation);
								this.summaries = summaries;
								this.syncCompletedNotifications();
							}
							this.summaries = summaries;
							this.listState = "idle";
							this.listPhase = "ready";
							this.syncCompletedNotifications();
							for (const s of this.summaries) {
								const session = this.sessions.get(s.sessionId);
								if (session === void 0) continue;
								session.handleBlank(s.blank);
								session.handleRunning(s.running);
							}
							for (const s of result.value.items) {
								const block = s.projections;
								if (block === void 0) continue;
								const store = this.projectionStore(s.sessionId);
								const values = block.values;
								for (const key of Object.keys(values)) store.apply(key, values[key], sessionSeqCursor(block.asOfSeq));
							}
						} else {
							this.listState = "error";
							this.listError = result.error;
						}
					} catch (error) {
						if (!(0, _deepseek_ai_dsh_api_gateway_client.isRemoteFailure)(error)) throw error;
						this.listState = "error";
						this.listError = error;
					} finally {
						this.listMutations = null;
						this.listInflight = null;
						this.notifier.markDirty();
					}
				})();
				return this.listInflight;
			}
			/**
			* Search visible session message content without adding transient query
			* state to the list snapshot.
			* @param query - non-blank literal phrase.
			* @param signal - cancellation for superseded UI queries.
			* @returns the Host result or a folded transport error.
			*/
			async search(query, signal) {
				const result = await this.remote.session.search({ query }, signal);
				if (!result.ok) return result;
				return {
					ok: true,
					value: {
						items: [...result.value.items],
						hasMore: result.value.hasMore
					}
				};
			}
			/**
			* Contract session.create; on success merge into summaries immediately (no
			* wait for the next refresh). A created session is blank by definition
			* (entity birth precedes the first message).
			* @param opts - target workspace or working directory, plus an optional caller-owned id.
			* @returns the create result.
			*/
			async create(opts = {}) {
				const shared = opts.sessionId === void 0 ? {} : { sessionId: opts.sessionId };
				const payload = opts.workspaceId !== void 0 ? {
					workspaceId: opts.workspaceId,
					...shared
				} : {
					...opts.cwd === void 0 ? {} : { cwd: opts.cwd },
					...shared
				};
				const result = await this.remote.session.create(payload);
				if (result.ok) this.recordMutation({
					kind: "upsert",
					summary: {
						sessionId: result.value.sessionId,
						updatedAt: Date.now(),
						running: false,
						blank: true,
						...opts.cwd !== void 0 ? { cwd: opts.cwd } : {}
					}
				});
				else {
					const publishedSessionId = workspaceAttachSessionId(result.error);
					if (publishedSessionId !== void 0) this.recordMutation({
						kind: "upsert",
						summary: {
							sessionId: publishedSessionId,
							updatedAt: Date.now(),
							running: false,
							blank: true
						}
					});
				}
				return result;
			}
			/**
			* Contract session.fork; on success merge the child into summaries
			* immediately (same synchronous-addressability guarantee as create). The
			* child carries the source's history, so it is never blank; lineage rides
			* parentSessionId so the list nests it under its source. A child published
			* before Workspace attachment fails is also reconciled into the list.
			* @param opts - source session and the optional seq anchoring the cut.
			* @returns the fork result (the child session id).
			*/
			async fork(opts) {
				const source = this.summaries.find((s) => s.sessionId === opts.sessionId);
				const result = await this.remote.session.fork({
					sessionId: opts.sessionId,
					...opts.atSeq === void 0 ? {} : { atSeq: opts.atSeq }
				});
				const childId = result.ok ? result.value.sessionId : workspaceAttachSessionId(result.error);
				if (childId !== void 0) this.recordMutation({
					kind: "upsert",
					summary: {
						sessionId: childId,
						updatedAt: Date.now(),
						running: false,
						blank: false,
						parentSessionId: opts.sessionId,
						...source?.cwd !== void 0 ? { cwd: source.cwd } : {}
					}
				});
				return result;
			}
			/**
			* Insert-or-enrich a locally synthesized summary: a new id prepends; an
			* existing entry only gains fields it lacks (the session-added frame and the
			* create() echo race — whichever lands second must fill the placeholder's
			* missing cwd/parentSessionId, never overwrite list-refresh data).
			*/
			mergeSummary(summary) {
				this.recordMutation({
					kind: "upsert",
					summary
				});
			}
			/** Apply immediately and retain for replay when a list response is in flight. */
			recordMutation(mutation) {
				this.listMutations?.push(mutation);
				this.summaries = applyMutation(this.summaries, mutation);
				this.syncCompletedNotifications();
				this.notifier.markDirty();
			}
			/**
			* uSES subscription entry for useSessionList.
			* @param listener - change callback.
			* @returns the unsubscribe function.
			*/
			subscribe(listener) {
				return this.notifier.subscribe(listener);
			}
			/**
			* Cached list snapshot (rebuilt lazily when dirty with no listeners).
			* @returns the cached reference (stable until the next flush).
			*/
			getListSnapshot() {
				this.notifier.ensureFresh();
				return this.listSnapshotCache;
			}
			/**
			* Apply a complete control baseline or one later replacement frame.
			* @param frame - baseline or live control replacement from Session Controller.
			*/
			handleControlFrame(frame) {
				if (frame.type === "baseline") {
					this.replaceControlBaseline(frame.value);
					return;
				}
				if (frame.type === "projection") {
					this.projectionStore(frame.sessionId).apply(frame.key, frame.value, SessionSeq(frame.seq));
					this.notifier.markDirty();
					return;
				}
				if (frame.type === "jobs") {
					if (frame.jobs.length === 0) this.jobsBySession.delete(frame.sessionId);
					else this.jobsBySession.set(frame.sessionId, frame.jobs);
					this.notifier.markDirty();
					return;
				}
				this.queues.set(frame.sessionId, frame.items);
				this.sessions.get(frame.sessionId)?.handleControlFrame(frame);
			}
			replaceControlBaseline(baseline) {
				this.queues.clear();
				for (const [sessionId, items] of Object.entries(baseline.queues)) this.queues.set(sessionId, items);
				this.jobsBySession.clear();
				for (const [sessionId, jobs] of Object.entries(baseline.jobs)) if (jobs.length > 0) this.jobsBySession.set(sessionId, jobs);
				for (const [sessionId, block] of Object.entries(baseline.projections)) {
					const store = this.projectionStore(sessionId);
					const asOfSeq = sessionSeqCursor(block.asOfSeq);
					store.truncate(asOfSeq);
					store.seed({
						...block,
						asOfSeq
					});
				}
				for (const [sessionId, session] of this.sessions) session.replaceControl(this.queues.get(sessionId) ?? []);
				this.notifier.markDirty();
			}
			/**
			* Apply one Session-list addition forwarded through `ctx.remote.$on`.
			* @param summary - current Host summary for the added Session.
			*/
			handleSessionAdded(summary) {
				this.mergeSummary(summary);
				this.sessions.get(summary.sessionId)?.handleBlank(summary.blank);
				const projections = summary.projections;
				if (projections !== void 0) {
					const store = this.projectionStore(summary.sessionId);
					for (const [key, value] of Object.entries(projections.values)) store.apply(key, value, sessionSeqCursor(projections.asOfSeq));
				}
				if (summary.origin === "subagent" && summary.parentSessionId !== void 0) this.markCatalogParentExpandable(summary.parentSessionId);
				if (summary.parentSessionId !== void 0 && (this.selected === summary.parentSessionId || this.openCatalogs.has(summary.parentSessionId))) this.scheduleCatalogRefresh(summary.parentSessionId);
			}
			/**
			* Apply one Session removal forwarded through `ctx.remote.$on`.
			* @param sessionId - removed Session identity.
			*/
			handleSessionRemoved(sessionId) {
				const durableSubagent = this.summaries.find((candidate) => candidate.sessionId === sessionId)?.origin === "subagent" || this.addresses.has(sessionId);
				this.recordMutation(durableSubagent ? {
					kind: "status",
					sessionId,
					running: false
				} : {
					kind: "remove",
					sessionId
				});
				this.updateCatalogActivity(sessionId, false);
				if (durableSubagent) this.sessions.get(sessionId)?.handleRunning(false);
				else this.sessions.get(sessionId)?.handleRemoved();
				this.queues.delete(sessionId);
				this.jobsBySession.delete(sessionId);
				if (!durableSubagent) this.projectionStores.delete(sessionId);
				const inflightCatalog = this.catalogInflight.get(sessionId);
				if (inflightCatalog !== void 0) {
					inflightCatalog.parentAvailableOverride = false;
					this.catalogStale.add(sessionId);
				}
				const ownedCatalog = this.catalogs.get(sessionId);
				if (ownedCatalog !== void 0 && ownedCatalog.parentAvailable) this.catalogs.set(sessionId, {
					...ownedCatalog,
					parentAvailable: false
				});
				for (const [childId, address] of this.addresses) if (address.parentSessionId === sessionId) this.sessions.get(childId)?.handleSubagentParentAvailable(false);
			}
			/**
			* Apply one live Agent running-state change.
			* @param sessionId - Session whose Agent state changed.
			* @param running - current Agent running state.
			*/
			handleSessionStatus(sessionId, running) {
				this.recordMutation({
					kind: "status",
					sessionId,
					running
				});
				this.sessions.get(sessionId)?.handleRunning(running);
				this.updateCatalogActivity(sessionId, running);
			}
			/**
			* Advance Session-list activity from one user-authored durable message.
			* @param sessionId - Session whose activity changed.
			* @param updatedAt - durable message timestamp.
			*/
			handleSessionActivity(sessionId, updatedAt) {
				this.recordMutation({
					kind: "activity",
					sessionId,
					updatedAt
				});
			}
			/**
			* Surface one live Agent failure on an already-materialized Session.
			* @param sessionId - Session whose Agent failed.
			* @param message - caller-visible failure description.
			*/
			handleSessionError(sessionId, message) {
				this.sessions.get(sessionId)?.handleAgentError(message);
			}
			/**
			* Repair one re-established Host-event generation with queryable baselines.
			* Opened Session follow streams resume independently through API Gateway.
			*/
			handleConnected() {
				this.refreshList();
				const selectedAddress = this.selected === void 0 ? void 0 : this.addresses.get(this.selected);
				if (selectedAddress !== void 0) this.refreshSubagents(selectedAddress.parentSessionId);
				if (this.selected !== void 0) this.refreshSubagents(this.selected);
				for (const parentSessionId of this.openCatalogs) this.refreshSubagents(parentSessionId);
			}
			/** Debounce membership refetches while one parent catalog is selected or open. */
			scheduleCatalogRefresh(parentSessionId) {
				if (this.catalogDebounce.has(parentSessionId)) return;
				const timer = setTimeout(() => {
					this.catalogDebounce.delete(parentSessionId);
					if (this.catalogInflight.has(parentSessionId)) {
						this.catalogStale.add(parentSessionId);
						return;
					}
					this.refreshSubagents(parentSessionId);
				}, 50);
				this.catalogDebounce.set(parentSessionId, timer);
			}
			/** Apply one Agent-driver transition to loaded and in-flight catalogs. */
			updateCatalogActivity(childSessionId, running) {
				const activity = running ? "running" : "inactive";
				for (const inflight of this.catalogInflight.values()) inflight.activityRows.set(childSessionId, activity);
				let changed = false;
				for (const [parentSessionId, catalog] of this.catalogs) {
					if (!catalog.entries.some((entry) => entry.kind === "child" && entry.id === childSessionId && entry.activity !== activity)) continue;
					const entries = catalog.entries.map((entry) => {
						if (entry.kind !== "child" || entry.id !== childSessionId) return entry;
						return {
							...entry,
							activity
						};
					});
					changed = true;
					this.catalogs.set(parentSessionId, {
						...catalog,
						entries
					});
				}
				if (changed) this.notifier.markDirty();
			}
			/** Preserve and project a positive expandability hint after one direct subagent publishes. */
			markCatalogParentExpandable(parentSessionId) {
				this.applyCatalogParentExpandable(parentSessionId);
				for (const inflight of this.catalogInflight.values()) inflight.expandableRows.add(parentSessionId);
			}
			/** Apply one positive expandability hint to every loaded catalog containing that unique row id. */
			applyCatalogParentExpandable(parentSessionId) {
				let changed = false;
				for (const [catalogParentId, catalog] of this.catalogs) {
					if (!catalog.entries.some((entry) => entry.kind === "child" && entry.id === parentSessionId && !entry.hasChildren)) continue;
					const entries = catalog.entries.map((entry) => {
						if (entry.kind !== "child" || entry.id !== parentSessionId || entry.hasChildren) return entry;
						return {
							...entry,
							hasChildren: true
						};
					});
					changed = true;
					this.catalogs.set(catalogParentId, {
						...catalog,
						entries
					});
				}
				if (changed) this.notifier.markDirty();
			}
			/** Fold request-local row mutations into one catalog result before publication. */
			withCatalogMutations(entries, expandableRows, activityRows) {
				return entries.map((entry) => {
					if (entry.kind !== "child") return entry;
					const activity = activityRows.get(entry.id);
					if (!expandableRows.has(entry.id) && activity === void 0) return entry;
					return {
						...entry,
						...expandableRows.has(entry.id) ? { hasChildren: true } : {},
						...activity === void 0 ? {} : { activity }
					};
				});
			}
			/**
			* Reconcile completion reminders against the latest summaries, eagerly after
			* every mutation and pull (a snapshot-build-time pass would collapse
			* consecutive status frames into one observation). A running→idle edge of a
			* non-selected session arms its reminder; running disarms it; removal drops
			* it. First observation only records the running bit — sessions already
			* idle at load get no reminder.
			*/
			syncCompletedNotifications() {
				const seen = /* @__PURE__ */ new Set();
				for (const s of this.summaries) {
					seen.add(s.sessionId);
					const prev = this.prevRunning.get(s.sessionId);
					if (prev === void 0) {
						this.prevRunning.set(s.sessionId, s.running);
						continue;
					}
					if (prev && !s.running) {
						if (s.sessionId !== this.selected) this.completedNotifications.add(s.sessionId);
					} else if (s.running) this.completedNotifications.delete(s.sessionId);
					this.prevRunning.set(s.sessionId, s.running);
				}
				for (const id of this.prevRunning.keys()) if (!seen.has(id)) this.prevRunning.delete(id);
				for (const id of this.completedNotifications) if (!seen.has(id)) this.completedNotifications.delete(id);
			}
			buildListSnapshot() {
				const items = flattenLineage(this.summaries.map((summary) => {
					const projectionStore = this.projectionStores.get(summary.sessionId);
					const title = projectionStore?.get("title");
					const projectionValues = projectionStore?.values();
					return {
						...summary,
						...typeof title === "string" && title !== "" ? { title } : {},
						...projectionValues === void 0 ? {} : { projectionValues }
					};
				}), this.completedNotifications).map((entry) => {
					const prev = this.entryCache.get(entry.sessionId);
					if (prev !== void 0 && prev.updatedAt === entry.updatedAt && prev.running === entry.running && prev.blank === entry.blank && prev.parentSessionId === entry.parentSessionId && prev.cwd === entry.cwd && prev.origin === entry.origin && prev.title === entry.title && prev.depth === entry.depth && prev.projectionValues === entry.projectionValues && prev.completed === entry.completed) return prev;
					this.entryCache.set(entry.sessionId, entry);
					return entry;
				});
				for (const id of this.entryCache.keys()) if (!items.some((e) => e.sessionId === id)) this.entryCache.delete(id);
				if (!(items.length === this.itemsCache.length && items.every((e, i) => e === this.itemsCache[i]))) this.itemsCache = items;
				const selected = this.selected;
				const current = selected !== void 0 && (items.some((item) => item.sessionId === selected) || this.addresses.has(selected)) ? selected : void 0;
				return {
					items: this.itemsCache,
					current,
					state: this.listState,
					phase: this.listPhase,
					error: this.listError,
					subagentsByParent: Object.fromEntries(this.catalogs),
					jobsBySession: Object.fromEntries(this.jobsBySession),
					currentAddress: current === void 0 ? void 0 : this.addresses.get(current)
				};
			}
		};
		/** Apply one list mutation without deriving display order. */
		function applyMutation(summaries, mutation) {
			switch (mutation.kind) {
				case "upsert": {
					const existing = summaries.find((summary) => summary.sessionId === mutation.summary.sessionId);
					if (existing === void 0) return [mutation.summary, ...summaries];
					const filled = {
						...existing,
						blank: existing.blank && mutation.summary.blank,
						...existing.cwd === void 0 && mutation.summary.cwd !== void 0 ? { cwd: mutation.summary.cwd } : {},
						...existing.parentSessionId === void 0 && mutation.summary.parentSessionId !== void 0 ? { parentSessionId: mutation.summary.parentSessionId } : {},
						...existing.origin === void 0 && mutation.summary.origin !== void 0 ? { origin: mutation.summary.origin } : {}
					};
					if (filled.cwd === existing.cwd && filled.parentSessionId === existing.parentSessionId && filled.origin === existing.origin && filled.blank === existing.blank) return [...summaries];
					return summaries.map((summary) => summary.sessionId === mutation.summary.sessionId ? filled : summary);
				}
				case "remove": return summaries.filter((summary) => summary.sessionId !== mutation.sessionId);
				case "status": return summaries.map((summary) => summary.sessionId === mutation.sessionId && (summary.running !== mutation.running || mutation.running && summary.blank) ? {
					...summary,
					running: mutation.running,
					blank: summary.blank && !mutation.running
				} : summary);
				case "activity": return summaries.map((summary) => summary.sessionId === mutation.sessionId && mutation.updatedAt > summary.updatedAt ? {
					...summary,
					updatedAt: mutation.updatedAt
				} : summary);
				case "engaged": return summaries.map((summary) => summary.sessionId === mutation.sessionId && summary.blank ? {
					...summary,
					blank: false
				} : summary);
			}
		}
		/** Temporary source-plane bridge while the Host contract and client project build independently. */
		function workspaceAttachSessionId(error) {
			return error.code === "session/workspace-attach-failed" ? error.details.sessionId : void 0;
		}
		/** Structured session-create failure. */
		var SessionCreateError = class extends Error {
			rpcError;
			requestedSessionId;
			name = "SessionCreateError";
			/**
			* @param rpcError - Host business or folded transport error.
			* @param requestedSessionId - caller-preallocated id used for later stream/list reconciliation.
			*/
			constructor(rpcError, requestedSessionId) {
				super(`session create failed: ${rpcError.code}: ${rpcError.message}`);
				this.rpcError = rpcError;
				this.requestedSessionId = requestedSessionId;
			}
		};
		/** Structured session-fork failure. */
		var SessionForkError = class extends Error {
			rpcError;
			sourceSessionId;
			name = "SessionForkError";
			/**
			* @param rpcError - Host business or folded transport error.
			* @param sourceSessionId - the session the fork was cut from.
			*/
			constructor(rpcError, sourceSessionId) {
				super(`session fork failed: ${rpcError.code}: ${rpcError.message}`);
				this.rpcError = rpcError;
				this.sourceSessionId = sourceSessionId;
			}
		};
		/**
		* Display title projection: durable title, project directory basename, then
		* the raw id.
		*/
		function displayTitleOf(title, cwd, id) {
			if (title !== void 0) return title;
			if (cwd !== void 0 && cwd !== "") {
				const base = workspaceTitleOf(cwd);
				if (base !== "") return base;
			}
			return id;
		}
		/**
		* Increment a trailing fork number while preserving its half-width or
		* full-width parentheses; an unnumbered title starts with ` (1)`.
		* @param title - source session's durable title.
		* @returns the title assigned to the fork child.
		*/
		function increasedForkTitle(title) {
			const ascii = /^(.*?)\((\d+)\)$/u.exec(title);
			if (ascii?.[1] !== void 0 && ascii[2] !== void 0) return `${ascii[1]}(${BigInt(ascii[2]) + 1n})`;
			const fullWidth = /^(.*?)（(\d+)）$/u.exec(title);
			if (fullWidth?.[1] !== void 0 && fullWidth[2] !== void 0) return `${fullWidth[1]}（${BigInt(fullWidth[2]) + 1n}）`;
			return `${title} (1)`;
		}
		/** Root sessions service: list store, current selection, object-layer manager, scope tree, bindings, and breadcrumb routes. */
		var ClientSessions = class {
			rootCtx;
			/**
			* The wire schema's own result bound, re-exposed for presentation plugins as
			* injected data. Not per-connection state: the `session.search` response
			* schema caps `items` at this constant, so every transport (fixture included)
			* reports the same number.
			*/
			searchResultLimit = 20;
			/** List snapshot store (list RPC + host stream increments; re-pulled on reconnect) — the useSessions standard feed, current included. */
			list;
			/** The object-layer instance cluster and frame dispatch entry. */
			manager;
			/**
			* Persisted selection cell (the durable half of `list.current`). Private on
			* purpose: reads go through the list snapshot; writes through {@link
			* ClientSessions.open} / {@link ClientSessions.clear}. Projection
			* validates it against the live list instead of destructively pruning, so a
			* selection survives transient list states (reconnect re-pull) and
			* resurfaces when its session returns.
			*/
			selection;
			scopes = /* @__PURE__ */ new Map();
			/** In-flight scope drops remain here after records leave `scopes`, so root disposal can await quiescence. */
			scopeDrops = /* @__PURE__ */ new Set();
			/**
			* The staged session id — follows `list.current` exactly, holding its last
			* defined value across masked gaps (a transiently absent selection blanks
			* `current` without moving the stage, so reconnect re-pulls and removals
			* keep the staged scope's frozen view alive until the stage moves on).
			*/
			watched;
			/** Removed-while-staged sessions whose teardown waits for the stage to move away. */
			deferredRemovals = /* @__PURE__ */ new Set();
			/**
			* @param ctx - client root context (scope fibers mount under it).
			* @param remote - generated Remote namespaces shared with every Session.
			*/
			constructor(rootCtx, remote) {
				this.rootCtx = rootCtx;
				this.selection = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)({}, { persist: { name: "dsh.sessions.current" } });
				const restored = this.selection.getSnapshot();
				this.manager = new SessionManager(remote, restored.sessionId, restored.subagentAddress);
				this.list = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)({
					ids: [],
					byId: {},
					current: void 0,
					phase: "pending",
					subagentsByParent: {},
					jobsBySession: {},
					currentAddress: void 0
				});
				const disposeManagerProjection = this.manager.subscribe(() => {
					this.projectList();
				});
				const disposeStageFollower = this.list.subscribe(() => {
					this.followCurrent();
				});
				rootCtx.effect(() => async () => {
					disposeStageFollower();
					disposeManagerProjection();
					const scopes = [...this.scopes];
					this.scopes.clear();
					this.deferredRemovals.clear();
					this.watched = void 0;
					for (const [id, record] of scopes) this.startScopeDrop(id, record);
					await this.drainScopeDrops();
					await this.manager.dispose();
				}, "session-controller.client.sessions");
				rootCtx.reflect.provide("sessions", this, void 0);
			}
			/**
			* Select a listed or retained catalog-addressed session as current.
			* @param id - listed or addressed session id.
			*/
			open(id) {
				this.manager.select(id);
			}
			/**
			* Open a healthy catalog child through its direct-parent address.
			* @param address - catalog-derived parent and child ids.
			*/
			openSubagent(address) {
				this.manager.selectSubagent(address);
			}
			/**
			* Resolve an already discovered direct-parent address without opening it.
			* Feature plugins use this to avoid Agent-bound RPCs in persisted child views.
			* @param id - possible addressed child id.
			* @returns The retained address, when present.
			*/
			subagentAddress(id) {
				return this.manager.subagentAddress(id);
			}
			/**
			* Inform the Session Controller whether a catalog menu is consuming membership updates.
			* @param parentSessionId - selected parent.
			* @param open - menu state.
			*/
			setSubagentCatalogOpen(parentSessionId, open) {
				this.manager.setSubagentCatalogOpen(parentSessionId, open);
			}
			/**
			* Refresh one direct-child catalog.
			* @param parentSessionId - catalog owner.
			*/
			refreshSubagents(parentSessionId) {
				return this.manager.refreshSubagents(parentSessionId);
			}
			/**
			* Clear the current selection so the layout shows the no-session empty
			* state (new-session affordance and the workspace preselection flow).
			* Wipes the persisted selection too — a reload stays on empty until the
			* user opens or starts a session. The staged scope keeps its frozen view
			* per the masked-gap contract until the next open() moves the stage.
			*/
			clear() {
				this.manager.clearSelection();
			}
			/**
			* Refresh the real Session baseline, reusing an in-flight pull.
			* @returns completion of the current or newly started baseline pull.
			*/
			refresh() {
				return this.manager.refreshList();
			}
			/**
			* Search the Host's visible message-content index. Results stay
			* request-local; the list snapshot remains the metadata authority.
			* @param query - non-blank literal phrase.
			* @param signal - cancellation for a superseded search.
			* @returns bounded results or a business/transport error.
			*/
			search(query, signal) {
				return this.manager.search(query, signal);
			}
			/**
			* Apply one Session Controller live-control frame.
			* @param frame - baseline or live control replacement.
			*/
			handleControlFrame(frame) {
				this.manager.handleControlFrame(frame);
			}
			/**
			* Apply one remotely forwarded Session-list addition.
			* @param summary - current Host summary for the added Session.
			*/
			handleSessionAdded(summary) {
				this.manager.handleSessionAdded(summary);
			}
			/**
			* Apply one remotely forwarded Session removal.
			* @param sessionId - removed Session identity.
			*/
			handleSessionRemoved(sessionId) {
				this.manager.handleSessionRemoved(sessionId);
			}
			/**
			* Apply one remotely forwarded running-state change.
			* @param args - Session identity and current Agent running state.
			*/
			handleSessionStatus(...args) {
				this.manager.handleSessionStatus(...args);
			}
			/**
			* Apply one remotely forwarded list-activity change.
			* @param args - Session identity and durable activity timestamp.
			*/
			handleSessionActivity(...args) {
				this.manager.handleSessionActivity(...args);
			}
			/**
			* Apply one remotely forwarded Agent failure.
			* @param args - Session identity and caller-visible failure description.
			*/
			handleSessionError(...args) {
				this.manager.handleSessionError(...args);
			}
			/** Rebuild the Session baseline and every opened window after connection. */
			handleConnected() {
				this.manager.handleConnected();
			}
			/**
			* Create a session on the host. Resolution guarantee: by the time the
			* promise resolves, the created session is in the list store and
			* {@link ClientSessions.binding} resolves it — callers (New Session
			* draft hand-off) may address the scope synchronously, without waiting a
			* notifier flush. The synchronous projection below makes this structural
			* rather than an accident of microtask ordering.
			* @param opts - target workspace or directory and an optional preallocated id.
			* @returns the new session id.
			* @throws {SessionCreateError} with the requested id.
			*/
			async create(opts = {}) {
				const result = await this.manager.create(opts);
				if (!result.ok) throw new SessionCreateError(result.error, opts.sessionId);
				this.projectList();
				return result.value.sessionId;
			}
			/**
			* Fork a session from a completed-turn prefix of the source (same
			* synchronous-addressability guarantee as {@link ClientSessions.create}:
			* on resolution the child is in the list store and open() can target it).
			* @param opts - source session id, the optional event seq anchoring the
			*   cut (the boundary is the first turn/end at or after it; an in-log
			*   anchor in an open turn is unavailable rather than clipped backward),
			*   and whether to increment an inherited durable title before resolving.
			*   A fractional anchor floors to a real event seq: the frozen nodes of an
			*   interrupted turn carry flow-ordering seqs between two events, and the
			*   wire takes integers only.
			* @returns the child session id.
			* @throws {SessionForkError} with the source id.
			* @throws {Error} when a requested child-title rename fails after creation.
			*/
			async fork(opts) {
				const sourceTitle = opts.increaseTitle ? this.list.getSnapshot().byId[opts.sessionId]?.title : void 0;
				const result = await this.manager.fork({
					sessionId: opts.sessionId,
					...opts.atSeq === void 0 ? {} : { atSeq: SessionSeq(Math.floor(opts.atSeq)) }
				});
				if (!result.ok) throw new SessionForkError(result.error, opts.sessionId);
				this.projectList();
				const childId = result.value.sessionId;
				if (sourceTitle !== void 0) {
					const child = this.binding(childId)?.session;
					if (child === void 0) throw new Error(`fork child "${childId}" is not locally addressable`);
					const renamed = await child.rename(increasedForkTitle(sourceTitle));
					if (!renamed.ok) throw new Error(`fork child rename failed: ${renamed.error.code}: ${renamed.error.message}`);
				}
				return childId;
			}
			/**
			* Resolve an Agent-scoped context view (use-and-discard).
			* @param id - session id (the agent identity — 1:1 same axis).
			* @returns scoped ctx, or undefined for a session neither listed nor already scoped.
			*/
			scope(id) {
				return this.resolve(id)?.ctx;
			}
			/**
			* Materialize the Agent scope named by a validated Host Remote Event.
			* The first successful Session-list baseline becomes authoritative for its
			* lifetime; until then, transport streams may address the scope in either
			* arrival order.
			* @param id - Host-projected Agent identity (the matching Session id).
			* @returns the identity-stable Agent Context.
			*/
			resolveAgentScope(id) {
				return (this.scopes.get(id) ?? this.materializeScope(id)).ctx;
			}
			/**
			* Read the Agent scope tag off a context. Service-method boundary: fetch
			* bundles must reach scope resolution through ctx.sessions — a cross-bundle
			* value import of the standalone helper would inline a second module
			* instance whose private tag Symbol never matches.
			* @param ctx - any client context.
			* @returns the session id, or undefined on root contexts.
			*/
			scopeOf(ctx) {
				return scopeOf(ctx);
			}
			/**
			* Resolve the business Session behind an Agent-scoped context — the one
			* hop every scoped consumer (event listeners, per-session controllers)
			* takes from ctx-space into object-space (the client mirror of host
			* `agent.session`). Same service-method boundary as
			* {@link ClientSessions.scopeOf}.
			* @param ctx - an Agent-scoped context.
			* @returns the session face, or undefined when the ctx is untagged or its scope was pruned.
			*/
			sessionOf(ctx) {
				const id = scopeOf(ctx);
				if (id === void 0) return void 0;
				return this.scopes.get(id)?.binding.session;
			}
			/**
			* Resolve the stable session binding (scope-addressed assembly feed). Pure
			* resolution — no staging, no window side effects.
			* @param id - session id.
			* @returns binding, or undefined for a session neither listed nor already scoped.
			*/
			binding(id) {
				return this.resolve(id)?.binding;
			}
			/**
			* Move the stage to the list's current session: sweep teardowns deferred
			* behind the previous occupant and pull the new occupant's history window.
			* Staging IS the open signal — the window opens ⟺ the session is on stage
			* — and open() is idempotent (an in-flight or completed open no-ops; a
			* failed one retries the next time current is touched).
			*/
			followCurrent() {
				const snapshot = this.list.getSnapshot();
				const current = snapshot.current;
				if (current === void 0 || snapshot.byId[current] === void 0 || current === this.watched) return;
				this.watched = current;
				this.sweepDeferred();
				const record = this.resolve(current);
				/* v8 ignore next 3 -- defensive: current is always a listed id (open()
				* validates and the projection masks absent selections), so resolve
				* cannot miss; kept so a future current writer cannot crash the notify. */
				if (record !== void 0) {
					record.session.open();
					this.manager.refreshSubagents(current);
				}
			}
			/**
			* Lazily mint the scope + binding for an eligible session. Eligibility and
			* prune share one predicate: listed on the host or selected
			* through a retained subagent address. Breadcrumb-only ancestors remain
			* summary data and do not keep scopes alive.
			*/
			resolve(id) {
				const existing = this.scopes.get(id);
				if (existing !== void 0) return existing;
				if (!this.eligible(id)) return void 0;
				return this.materializeScope(id);
			}
			/** Materialize one scope after its caller establishes that the id may be addressed. */
			materializeScope(id) {
				const { fiber, ctx } = createScope(this.rootCtx, id);
				const session = this.manager.get(id);
				session.bindScope(ctx);
				const record = {
					fiber,
					ctx,
					binding: {
						sessionId: id,
						session,
						eventSource: session.eventSource,
						ctx
					},
					session
				};
				this.scopes.set(id, record);
				return record;
			}
			/** The one aliveness predicate shared by scope mint and prune: host-listed or currently addressed. */
			eligible(id) {
				const { ids, current } = this.list.getSnapshot();
				return current === id || ids.includes(id);
			}
			/** Project the manager's list snapshot into the store (title derivation is display-only). */
			projectList() {
				const { items, current, phase, subagentsByParent, jobsBySession, currentAddress } = this.manager.getListSnapshot();
				const ids = [];
				const byId = {};
				for (const entry of items) {
					ids.push(entry.sessionId);
					byId[entry.sessionId] = {
						id: entry.sessionId,
						displayTitle: displayTitleOf(entry.title, entry.cwd, entry.sessionId),
						running: entry.running,
						...entry.completed ? { completed: true } : {},
						blank: entry.blank,
						updatedAt: entry.updatedAt,
						...entry.projectionValues === void 0 ? {} : { projectionValues: entry.projectionValues },
						...entry.title !== void 0 ? { title: entry.title } : {},
						...entry.cwd !== void 0 ? { cwd: entry.cwd } : {},
						...entry.parentSessionId !== void 0 ? { parentId: entry.parentSessionId } : {},
						...entry.origin !== void 0 ? { origin: entry.origin } : {}
					};
				}
				if (current !== void 0 && currentAddress !== void 0) {
					const seen = /* @__PURE__ */ new Set();
					let address = currentAddress;
					while (address !== void 0 && !seen.has(address.childSessionId)) {
						const childId = address.childSessionId;
						seen.add(childId);
						const child = subagentsByParent[address.parentSessionId]?.entries.find((entry) => entry.kind === "child" && entry.id === childId);
						if (child?.kind !== "child") break;
						const displayTitle = child.label ?? childId;
						const summary = byId[childId];
						if (summary === void 0) byId[childId] = {
							id: childId,
							displayTitle,
							parentId: address.parentSessionId,
							origin: "subagent",
							running: child.activity === "running",
							blank: false,
							updatedAt: 0
						};
						else if (summary.displayTitle !== displayTitle) byId[childId] = {
							...summary,
							displayTitle
						};
						const parent = byId[address.parentSessionId];
						if (parent !== void 0 && parent.origin !== "subagent") break;
						address = this.manager.navigationAddress(address.parentSessionId);
					}
				}
				const persisted = this.selection.getSnapshot().sessionId;
				if (current === void 0) {
					if (persisted !== void 0) this.selection.set({});
				} else if (byId[current] !== void 0 && (persisted !== current || this.selection.getSnapshot().subagentAddress?.childSessionId !== currentAddress?.childSessionId || this.selection.getSnapshot().subagentAddress?.parentSessionId !== currentAddress?.parentSessionId || this.selection.getSnapshot().subagentAddress?.mode !== currentAddress?.mode)) this.selection.set({
					sessionId: current,
					...currentAddress === void 0 ? {} : { subagentAddress: currentAddress }
				});
				this.list.set({
					ids,
					byId,
					current,
					phase,
					subagentsByParent,
					jobsBySession,
					currentAddress
				});
				this.pruneScopes();
			}
			/** Tear down scope + instance for no-longer-eligible sessions off stage; the staged one defers until the stage moves. */
			pruneScopes() {
				if (this.list.getSnapshot().phase === "pending") return;
				for (const [id, record] of this.scopes) {
					if (this.eligible(id)) continue;
					if (id === this.watched) {
						this.deferredRemovals.add(id);
						continue;
					}
					this.scopes.delete(id);
					this.deferredRemovals.delete(id);
					this.startScopeDrop(id, record);
				}
			}
			startScopeDrop(id, record) {
				const drop = this.dropScope(id, record);
				this.scopeDrops.add(drop);
				drop.then(() => {
					this.scopeDrops.delete(drop);
				}, () => {
					this.scopeDrops.delete(drop);
				});
			}
			async drainScopeDrops() {
				while (this.scopeDrops.size > 0) await Promise.allSettled([...this.scopeDrops]);
			}
			/**
			* One teardown for the whole per-session axis: the scope
			* fiber (cascading every actx-registered effect: input shell, slash
			* controller, popup, plugin stores, listeners), the session-keyed slot
			* registrations and the Session instance itself — the host session log is the
			* durable truth, a reopen lazily rebuilds and backfills via open().
			*/
			async dropScope(id, record) {
				record.session.unbindScope();
				await Promise.allSettled([record.fiber.dispose(), this.manager.drop(id)]);
			}
			/** Run deferred teardowns whose session is no longer staged (called when the stage moves). */
			sweepDeferred() {
				for (const id of [...this.deferredRemovals]) {
					/* v8 ignore next -- defensive: only the staged id ever defers, and every
					* stage move sweeps first, so the set cannot contain the id the stage just
					* moved to; kept as a guard against future extra sweep call sites. */
					if (id === this.watched) continue;
					if (this.eligible(id)) {
						this.deferredRemovals.delete(id);
						continue;
					}
					const record = this.scopes.get(id);
					this.deferredRemovals.delete(id);
					/* v8 ignore next -- defensive: prune deletes a scope and its deferral
					* together, so a deferred id always still owns its record; kept so a
					* future teardown path cannot double-dispose. */
					if (record !== void 0) {
						this.scopes.delete(id);
						this.startScopeDrop(id, record);
					}
				}
			}
		};
		/** Client Session object layer, Agent scopes, and Remote lifecycle wiring. */
		/** Required Remote and Context projection services. */
		const inject = [
			"connection",
			"fileUpload",
			"typert",
			"remote",
			"remote.commands",
			"remote.session",
			"remote.subagents"
		];
		/**
		* Install Client Session state and its reconnecting control stream.
		* @param ctx - Client Cordis context.
		*/
		function apply(ctx) {
			const remotes = ctx.remote;
			const sessions = new ClientSessions(ctx, remotes);
			ctx.remote.$on("api-session/added", (summary) => {
				sessions.handleSessionAdded(summary);
			});
			ctx.remote.$on("api-session/removed", (sessionId) => {
				sessions.handleSessionRemoved(sessionId);
			});
			ctx.remote.$on("api-session/status", (sessionId, running) => {
				sessions.handleSessionStatus(sessionId, running);
			});
			ctx.remote.$on("api-session/activity", (sessionId, updatedAt) => {
				sessions.handleSessionActivity(sessionId, updatedAt);
			});
			ctx.remote.$on("api-session/error", (sessionId, message) => {
				sessions.handleSessionError(sessionId, message);
			});
			const control = createSessionControlStream(remotes, {
				accept: (frame) => {
					sessions.handleControlFrame(frame);
				},
				failed: (error) => {
					console.error("[session-controller] control stream failed:", error);
				}
			});
			control.start();
			ctx.on("connection/reset", () => {
				sessions.handleConnected();
			});
			if (ctx.remote.$host.home !== void 0) sessions.handleConnected();
			ctx.typert.contexts.registerClient("agent", {
				identity: (candidate) => sessions.scopeOf(candidate),
				resolve: (sessionId) => sessions.resolveAgentScope(sessionId)
			});
			ctx.effect(() => async () => {
				await control.dispose();
			}, "session-controller.client.control");
		}
		exports.MutableSessionEventSource = MutableSessionEventSource;
		exports.SESSION_SEARCH_RESULT_LIMIT = SESSION_SEARCH_RESULT_LIMIT;
		exports.SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS = SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS;
		exports.SessionCreateError = SessionCreateError;
		exports.SessionEventStream = SessionEventStream;
		exports.SessionForkError = SessionForkError;
		exports.apply = apply;
		exports.createScope = createScope;
		exports.createSessionControlStream = createSessionControlStream;
		exports.inject = inject;
		exports.scopeOf = scopeOf;
		return module.exports;
	}
});

//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-util-workspace-path@0.1.5-rc.2_@deepseek-ai+cordis@4.0.2/node_modules/@deepseek-ai/dsh-util-workspace-path/lib/index.js
/**
* Browser-safe Workspace path and display helpers.
* @module @deepseek-ai/dsh-util-workspace-path
*/
/** Whether a path uses a Windows drive or UNC prefix. */
function isWindowsStylePath(value) {
	return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith("\\\\");
}
/**
* Abbreviate a POSIX home directory for display.
* @param path - Absolute or already-short display path.
* @param home - Host account home; absent skips abbreviation.
* @returns `~` or `~/…` for the POSIX home and its descendants, otherwise `path`.
*/
function abbreviateHomePath(path, home) {
	if (home === void 0 || home === "") return path;
	if (isWindowsStylePath(path) || isWindowsStylePath(home)) return path;
	const root = home.replace(/\/+$/, "");
	if (root === "" || root === "/") return path;
	if (path.replace(/\/+$/, "") === root) return "~";
	if (path.startsWith(`${root}/`)) return `~${path.slice(root.length)}`;
	return path;
}
/**
* Read the final non-empty segment of a Workspace path for display.
* Workspace-label surfaces use this helper instead of deriving another basename.
* @param path - Workspace directory path using POSIX or Windows separators.
* @returns the final segment, or an empty string for a separator-only path.
*/
function workspaceTitleOf(path) {
	const trimmed = path.replace(/[/\\]+$/, "");
	const separator = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
	return trimmed.slice(separator + 1);
}

//#endregion
//#region src/client/subagent-lineage.ts
/**
* Index uninterrupted subagent descendants under each ancestor.
* @param summaries - Session summaries keyed by id.
* @returns descendant totals keyed by possible parent id.
*/
function indexSubagentDescendants(summaries) {
	const indexed = /* @__PURE__ */ new Map();
	for (const descendant of Object.values(summaries)) {
		if (descendant.origin !== "subagent") continue;
		const seen = /* @__PURE__ */ new Set();
		let current = descendant;
		while (current?.origin === "subagent" && current.parentId !== void 0 && !seen.has(current.id)) {
			seen.add(current.id);
			const aggregate = indexed.get(current.parentId);
			if (aggregate === void 0) indexed.set(current.parentId, {
				count: 1,
				runningCount: descendant.running ? 1 : 0
			});
			else {
				aggregate.count += 1;
				if (descendant.running) aggregate.runningCount += 1;
			}
			current = summaries[current.parentId];
		}
	}
	return indexed;
}

//#endregion
//#region src/client/tree.ts
/** Group key for Sessions outside every Workspace. */
const UNGROUPED_KEY = "";
/**
* Resolve the Workspace browser group that owns one Session.
* @param workspaces - authoritative Workspace membership.
* @param sessionId - Session whose browser group is required.
* @returns owning Workspace id, or {@link UNGROUPED_KEY} when no Workspace accounts for it.
*/
function owningGroupKey(workspaces, sessionId) {
	return workspaces.find((workspace) => workspace.sessionIds.includes(sessionId))?.workspaceId ?? "";
}
/**
* Directory display label: basename of the path (both separators accepted).
* Ungrouped-bucket fallback for surfaces without a workspace title.
* @param cwd - directory path, or undefined for the ungrouped bucket.
* @returns basename, the raw cwd when it has no basename, or an empty ungrouped marker.
*/
function workspaceLabel(cwd) {
	if (cwd === void 0 || cwd === "") return "";
	const base = workspaceTitleOf(cwd);
	return base !== "" ? base : cwd;
}
/** Recency comparator: newest first, id as the deterministic tiebreak (ids are unique per group). */
function byRecency(a, b) {
	if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
	return a.id < b.id ? -1 : 1;
}
/**
* Ordinary sessions are visible; among blank sessions, only the current one
* is visible. Subagent children use their parent header catalog; archived
* sessions are visible nowhere, while their accounting slots remain so
* unarchiving restores position.
*/
function sessionVisible(session, current, archived) {
	return session.origin !== "subagent" && !archived.has(session.id) && (!session.blank || session.id === current);
}
/**
* A blank session is the selected Workspace's provisional New Session row;
* its canonical title never enters search (blank rows are query-excluded)
* and the renderer localizes its display label.
*/
function sessionTitle(session) {
	return session.blank ? "" : session.displayTitle;
}
/** The list projection alone owns the best-effort active-Schedule indicator. */
function hasActiveSchedule(session) {
	return (session.projectionValues?.schedule?.length ?? 0) > 0;
}
/** Build one group without projecting session lineage into presentation. */
function buildGroup(key, workspaceId, cwd, createdAt, label, members, order) {
	const sessions = [...members];
	if (order === "recency") sessions.sort(byRecency);
	return {
		key,
		workspaceId,
		cwd,
		createdAt,
		label,
		sessions
	};
}
/** Apply a stored Ungrouped order and append newly loose Sessions by recency. */
function orderedUngrouped(members, stored) {
	const byId = new Map(members.map((session) => [session.id, session]));
	const included = /* @__PURE__ */ new Set();
	const ordered = [];
	for (const key of stored) {
		const session = byId.get(key);
		if (session === void 0 || included.has(key)) continue;
		ordered.push(session);
		included.add(key);
	}
	for (const session of [...members].sort(byRecency)) {
		if (included.has(session.id)) continue;
		ordered.push(session);
	}
	return ordered;
}
/**
* Group Sessions by Host Workspace: one group per entity in stable Host
* order, with members resolved from sessionIds in their stored order. Sessions
* outside every Workspace trail in the browser-local Ungrouped order, which
* falls back to recency before that order is initialized.
*/
function groupByWorkspace(list, workspaces, archived, ungroupedOrder) {
	const groups = [];
	const accounted = /* @__PURE__ */ new Set();
	for (const workspace of workspaces) {
		const members = [];
		for (const id of workspace.sessionIds) {
			const summary = list.byId[id];
			if (summary === void 0) continue;
			accounted.add(id);
			if (!sessionVisible(summary, list.current, archived)) continue;
			members.push(summary);
		}
		groups.push(buildGroup(workspace.workspaceId, workspace.workspaceId, workspace.path, Date.parse(workspace.createdAt), workspace.title, members, "account"));
	}
	const stray = list.ids.map((id) => list.byId[id]).filter((s) => s !== void 0 && !accounted.has(s.id) && sessionVisible(s, list.current, archived));
	if (stray.length > 0) groups.push(buildGroup("", void 0, void 0, void 0, "", ungroupedOrder === void 0 ? stray : orderedUngrouped(stray, ungroupedOrder), ungroupedOrder === void 0 ? "recency" : "account"));
	return groups;
}
/** Keep navigation presentation independent from domain-owned interaction objects. */
function visiblePendingKind(kind) {
	switch (kind) {
		case "approval":
		case "plan-review":
		case "question": return kind;
		default: return;
	}
}
function sessionNode(s, descendants, pendingInteractions) {
	const pendingInteraction = visiblePendingKind(pendingInteractions.get(s.id)?.kind);
	return {
		id: s.id,
		title: sessionTitle(s),
		blank: s.blank,
		running: s.running,
		runningSubagentCount: descendants.get(s.id)?.runningCount ?? 0,
		completed: s.completed === true,
		hasActiveSchedule: hasActiveSchedule(s),
		updatedAt: s.updatedAt,
		...pendingInteraction === void 0 ? {} : { pendingInteraction }
	};
}
/**
* Derive the workspace browser groups with every session as a top-level row.
*
* Every group shows; sessions populate under expanded groups in the selected
* local order. Blank sessions are excluded except for the selected
* provisional New Session row; archived sessions are excluded everywhere.
* Content search lives outside this derivation
* (see {@link deriveSearchResults}).
* @param list - sessions list snapshot (`current` feeds containsCurrent).
* @param workspaces - real workspaces in stable Host order.
* @param archivedSessionIds - registry-global archive set.
* @param pendingInteractions - pending UI interactions by Session.
* @param view - local expansion arrays.
* @returns group sections in render order.
*/
function deriveGroups(list, workspaces, archivedSessionIds, pendingInteractions, view) {
	const archived = new Set(archivedSessionIds);
	const expandedGroups = new Set(view.expandedGroups);
	const descendants = indexSubagentDescendants(list.byId);
	const currentGroup = list.current === void 0 ? void 0 : owningGroupKey(workspaces, list.current);
	const groups = [];
	for (const g of groupByWorkspace(list, workspaces, archived, view.ungroupedOrder)) {
		const expanded = expandedGroups.has(g.key);
		groups.push({
			key: g.key,
			workspaceId: g.workspaceId,
			cwd: g.cwd,
			createdAt: g.createdAt,
			label: g.label,
			sessionCount: g.sessions.length,
			expanded,
			containsCurrent: g.key === currentGroup,
			sessions: expanded ? g.sessions.map((session) => sessionNode(session, descendants, pendingInteractions)) : []
		});
	}
	return groups;
}
/**
* Derive the flat session list ("In one list" mode): every session — fork
* children included — as a top-level row, strictly newest-first. No grouping,
* no parent/child adjacency. Content search lives outside this derivation
* (see {@link deriveSearchResults}).
* @param list - sessions list snapshot.
* @param archivedSessionIds - registry-global archive set.
* @param pendingInteractions - pending UI interactions by Session.
* @returns flat rows in render order.
*/
function deriveFlat(list, archivedSessionIds, pendingInteractions) {
	const archived = new Set(archivedSessionIds);
	const descendants = indexSubagentDescendants(list.byId);
	const rows = [];
	for (const id of list.ids) {
		const s = list.byId[id];
		if (s === void 0 || !sessionVisible(s, list.current, archived)) continue;
		rows.push(s);
	}
	rows.sort(byRecency);
	return rows.map((session) => sessionNode(session, descendants, pendingInteractions));
}
/**
* Merge immediate title/Workspace substring matches with ranked Host content
* matches. Local rows lead newest-first, content-only rows retain backend
* order, and duplicate sessions receive the backend snippet in place.
* @param list - session metadata authority.
* @param workspaces - Workspace membership and display labels.
* @param query - caller text; surrounding whitespace is ignored.
* @param archivedSessionIds - registry-global archive set (members never match).
* @param pendingInteractions - pending UI interactions by Session.
* @param content - ranked Host content-search page.
* @param limit - protocol-owned maximum merged row count.
* @returns bounded deduplicated flat rows and a refine-query hint bit.
*/
function deriveSearchResults(list, workspaces, query, archivedSessionIds, pendingInteractions, content, limit) {
	const q = query.trim().toLowerCase();
	if (q === "") return {
		items: [],
		hasMore: false
	};
	const archived = new Set(archivedSessionIds);
	const descendants = indexSubagentDescendants(list.byId);
	const workspaceBySession = /* @__PURE__ */ new Map();
	for (const workspace of workspaces) for (const sessionId of workspace.sessionIds) if (!workspaceBySession.has(sessionId)) workspaceBySession.set(sessionId, workspace.title);
	const labelOf = (summary) => workspaceBySession.get(summary.id) ?? workspaceLabel(summary.cwd);
	const contentBySession = /* @__PURE__ */ new Map();
	for (const item of content.items) if (!contentBySession.has(item.sessionId)) contentBySession.set(item.sessionId, item);
	const local = [];
	for (const id of list.ids) {
		const summary = list.byId[id];
		if (summary === void 0 || summary.blank || !sessionVisible(summary, list.current, archived)) continue;
		if (sessionTitle(summary).toLowerCase().includes(q) || labelOf(summary).toLowerCase().includes(q)) local.push(summary);
	}
	local.sort(byRecency);
	const ordered = [];
	const included = /* @__PURE__ */ new Set();
	const include = (summary) => {
		if (included.has(summary.id)) return;
		included.add(summary.id);
		ordered.push(summary);
	};
	for (const summary of local) include(summary);
	for (const item of content.items) {
		const summary = list.byId[item.sessionId];
		if (summary !== void 0 && !summary.blank && sessionVisible(summary, list.current, archived)) include(summary);
	}
	return {
		items: ordered.slice(0, limit).map((summary) => {
			const match = contentBySession.get(summary.id);
			const pendingInteraction = visiblePendingKind(pendingInteractions.get(summary.id)?.kind);
			return {
				id: summary.id,
				title: sessionTitle(summary),
				workspace: labelOf(summary),
				running: summary.running,
				runningSubagentCount: descendants.get(summary.id)?.runningCount ?? 0,
				...pendingInteraction === void 0 ? {} : { pendingInteraction },
				completed: summary.completed === true,
				hasActiveSchedule: hasActiveSchedule(summary),
				...match === void 0 ? {} : { snippet: match.snippet }
			};
		}),
		hasMore: content.hasMore || ordered.length > limit
	};
}

//#endregion
//#region \0dsh-css:src/client/rows/Rows.module.css.mjs
const css$3 = "._1Jb0BW_projectRow,._1Jb0BW_sessionRow{cursor:pointer;user-select:none;color:var(--dsw-alias-label-primary);border-radius:8px;align-items:center;gap:6px;padding:0 8px;display:flex}._1Jb0BW_projectRow:hover,._1Jb0BW_sessionRow:hover,._1Jb0BW_sessionRow._1Jb0BW_selected{background:var(--dsw-alias-interactive-bg-hover)}._1Jb0BW_searchResultRow{box-sizing:border-box;cursor:pointer;text-align:left;width:100%;min-height:48px;color:var(--dsw-alias-label-primary);background:0 0;border:none;border-radius:8px;flex-direction:column;align-items:stretch;padding:4px 8px;display:flex}._1Jb0BW_searchResultRow:hover,._1Jb0BW_searchResultRow._1Jb0BW_selected{background:var(--dsw-alias-interactive-bg-hover)}._1Jb0BW_searchResultHeading{align-items:center;min-width:0;display:flex}._1Jb0BW_searchResultTitle{text-overflow:ellipsis;white-space:nowrap;flex:0 auto;min-width:0;margin-left:4px;font-size:14px;line-height:20px;overflow:hidden}._1Jb0BW_searchResultMeta{align-items:center;gap:6px;min-width:0;margin-left:20px;display:flex}._1Jb0BW_searchResultWorkspace,._1Jb0BW_searchResultSnippet{text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:17px;overflow:hidden}._1Jb0BW_searchResultWorkspace{max-width:40%;color:var(--dsw-alias-label-tertiary);flex:none}._1Jb0BW_searchResultSnippet{min-width:0;color:var(--dsw-alias-label-secondary);flex:1}._1Jb0BW_projectRow{box-sizing:border-box;align-items:center;height:34px}._1Jb0BW_projectRowMultiroot{height:auto;min-height:46px}._1Jb0BW_projectMeta{text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;overflow:hidden}._1Jb0BW_projectRow ._1Jb0BW_rowActions{height:20px}._1Jb0BW_sessionRow{height:32px;animation:_1Jb0BW_row-in .15s var(--ds-ease-in-out);gap:0}._1Jb0BW_sessionRow ._1Jb0BW_title{margin:0 6px 0 4px}._1Jb0BW_flatSessionRowWithoutStatus ._1Jb0BW_title{margin-left:0}@keyframes _1Jb0BW_row-in{0%{opacity:0}}._1Jb0BW_slot{width:16px;height:20px;color:var(--dsw-alias-label-tertiary);flex:none;justify-content:center;align-items:center;display:inline-flex}._1Jb0BW_visuallyHidden{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}._1Jb0BW_folderActive{color:var(--dsw-alias-state-business-primary)}._1Jb0BW_projectRow ._1Jb0BW_chevron{display:none}._1Jb0BW_projectRow:hover ._1Jb0BW_chevron{display:inline-flex}._1Jb0BW_projectRow:hover ._1Jb0BW_folder{display:none}._1Jb0BW_arrow{transition:transform .15s var(--ds-ease-in-out)}._1Jb0BW_arrowOpen{transform:rotate(90deg)}._1Jb0BW_projectText{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}._1Jb0BW_title{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:14px;line-height:20px;overflow:hidden}._1Jb0BW_renameInput{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-button-elevated-fill);min-width:0;color:inherit;border-radius:4px;outline:none;padding:0 2px;font-size:14px;line-height:20px}._1Jb0BW_sessionRow ._1Jb0BW_title{flex:1}._1Jb0BW_meta{text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px;overflow:hidden}._1Jb0BW_time{color:var(--dsw-alias-label-tertiary);flex:none;font-size:12px;line-height:20px}._1Jb0BW_scheduleIndicator{width:16px;height:20px;color:var(--dsw-alias-label-tertiary);flex:none;justify-content:center;align-items:center;margin-right:6px;display:inline-flex}._1Jb0BW_searchScheduleIndicator{margin-left:4px;margin-right:0}._1Jb0BW_dot{flex:none}._1Jb0BW_rowActions{flex:none;align-items:center;gap:12px;display:none}._1Jb0BW_projectRow:hover ._1Jb0BW_rowActions,._1Jb0BW_sessionRow:hover ._1Jb0BW_rowActions,._1Jb0BW_projectRow._1Jb0BW_menuOpen ._1Jb0BW_rowActions,._1Jb0BW_sessionRow._1Jb0BW_menuOpen ._1Jb0BW_rowActions{display:inline-flex}._1Jb0BW_sessionRow:hover ._1Jb0BW_time,._1Jb0BW_sessionRow._1Jb0BW_menuOpen ._1Jb0BW_time{display:none}._1Jb0BW_projectRow._1Jb0BW_menuOpen,._1Jb0BW_sessionRow._1Jb0BW_menuOpen{background:var(--dsw-alias-interactive-bg-hover)}._1Jb0BW_sessionRow._1Jb0BW_dropBefore,._1Jb0BW_sessionRow._1Jb0BW_dropAfter{position:relative}._1Jb0BW_sessionRow._1Jb0BW_dropBefore:before,._1Jb0BW_sessionRow._1Jb0BW_dropAfter:after{content:\"\";z-index:1;background:linear-gradient(55deg, transparent calc(50% - 1px), var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) 0 0 / 5px 7px no-repeat, linear-gradient(125deg, transparent calc(50% - 1px), var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) 0 5px / 5px 7px no-repeat, linear-gradient(var(--dsw-alias-state-business-primary) 0 0) 4px 5px / calc(100% - 4px) 2px no-repeat;pointer-events:none;height:12px;position:absolute;left:0;right:4px}._1Jb0BW_sessionRow._1Jb0BW_dropBefore:before{top:-7px}._1Jb0BW_sessionRow._1Jb0BW_dropAfter:after{bottom:-7px}._1Jb0BW_hoverContent{flex-direction:column;gap:8px;display:flex}._1Jb0BW_hoverTitle{color:#fff;overflow-wrap:break-word;font-size:14px;line-height:20px}._1Jb0BW_hoverPath{color:#cfd3d6;word-break:break-all;font-size:12px;line-height:16px}._1Jb0BW_hoverTime{color:#cfd3d6;font-size:12px;line-height:16px}._1Jb0BW_hoverStatus{color:#adb2b8;align-items:center;gap:8px;font-size:12px;line-height:20px;display:flex}._1Jb0BW_iconButton{cursor:pointer;width:16px;height:16px;color:var(--dsw-alias-label-tertiary);background:0 0;border:none;border-radius:4px;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}._1Jb0BW_iconButton:hover{color:var(--dsw-alias-label-primary)}._1Jb0BW_chevron{color:var(--dsw-alias-label-caption)}@media (prefers-reduced-motion:reduce){._1Jb0BW_sessionRow,._1Jb0BW_arrow{transition:none;animation:none}}";
const tagId$3 = "dsh-multiroot-workspace/Rows.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]") === null) {
	const tag = document.createElement("style");
	tag.dataset.plugin = "dsh-multiroot-workspace";
	tag.dataset.pluginCss = tagId$3;
	tag.textContent = css$3;
	document.head.appendChild(tag);
}
var Rows_module_css_default = {
	"arrow": "_1Jb0BW_arrow",
	"arrowOpen": "_1Jb0BW_arrowOpen",
	"chevron": "_1Jb0BW_chevron",
	"dot": "_1Jb0BW_dot",
	"dropAfter": "_1Jb0BW_dropAfter",
	"dropBefore": "_1Jb0BW_dropBefore",
	"flatSessionRowWithoutStatus": "_1Jb0BW_flatSessionRowWithoutStatus",
	"folder": "_1Jb0BW_folder",
	"folderActive": "_1Jb0BW_folderActive",
	"hoverContent": "_1Jb0BW_hoverContent",
	"hoverPath": "_1Jb0BW_hoverPath",
	"hoverStatus": "_1Jb0BW_hoverStatus",
	"hoverTime": "_1Jb0BW_hoverTime",
	"hoverTitle": "_1Jb0BW_hoverTitle",
	"iconButton": "_1Jb0BW_iconButton",
	"menuOpen": "_1Jb0BW_menuOpen",
	"meta": "_1Jb0BW_meta",
	"projectMeta": "_1Jb0BW_projectMeta",
	"projectRow": "_1Jb0BW_projectRow",
	"projectRowMultiroot": "_1Jb0BW_projectRowMultiroot",
	"projectText": "_1Jb0BW_projectText",
	"renameInput": "_1Jb0BW_renameInput",
	"row-in": "_1Jb0BW_row-in",
	"rowActions": "_1Jb0BW_rowActions",
	"scheduleIndicator": "_1Jb0BW_scheduleIndicator",
	"searchResultHeading": "_1Jb0BW_searchResultHeading",
	"searchResultMeta": "_1Jb0BW_searchResultMeta",
	"searchResultRow": "_1Jb0BW_searchResultRow",
	"searchResultSnippet": "_1Jb0BW_searchResultSnippet",
	"searchResultTitle": "_1Jb0BW_searchResultTitle",
	"searchResultWorkspace": "_1Jb0BW_searchResultWorkspace",
	"searchScheduleIndicator": "_1Jb0BW_searchScheduleIndicator",
	"selected": "_1Jb0BW_selected",
	"sessionRow": "_1Jb0BW_sessionRow",
	"slot": "_1Jb0BW_slot",
	"time": "_1Jb0BW_time",
	"title": "_1Jb0BW_title",
	"visuallyHidden": "_1Jb0BW_visuallyHidden"
};

//#endregion
//#region src/client/rows/Rows.tsx
/**
* Workspace browser tree row components (figma Cell set 14:3080): pure presentational —
* all data and callbacks arrive via props. Hover swaps (folder->chevron,
* time->ellipsis, action buttons) are CSS-only. Row ... menus are visual-only
* except workspace Rename/Delete and session Rename/Fork/Archive; the session
* and workspace hover cards are suppressed while a menu is open.
*/
/** Row display title: blank rows show the localized New Session label. */
function displayTitle(node, t) {
	return node.blank ? t("session.new") : node.title;
}
/** Localized compact relative time ("刚刚"/"5分钟" in zh, "now"/"5min" in en). */
function timeLabel(updatedAt, now, t) {
	const { unit, n } = (0, _deepseek_ai_dsh_client_ui_primitives.relativeTime)(updatedAt, now);
	return unit === "now" ? t("time.now") : t(`time.${unit}`, { n });
}
/** Hover-card variant: distances wrap in the ago template; the now bucket stays bare (no "now ago"). */
function hoverTimeLabel(updatedAt, now, t) {
	const { unit, n } = (0, _deepseek_ai_dsh_client_ui_primitives.relativeTime)(updatedAt, now);
	return unit === "now" ? t("time.now") : t("time.ago", { t: t(`time.${unit}`, { n }) });
}
/**
* Absolute creation time through the dictionary's date template (the message
* clock pattern): `toLocaleString` would follow the browser language, not the
* app locale, and produce mixed-language text after a switch.
*/
function createdLabel(createdAt, t) {
	const d = new Date(createdAt);
	const pad2 = (v) => String(v).padStart(2, "0");
	return t("hover.created", { time: `${t("date.ymd", {
		y: d.getFullYear(),
		m: d.getMonth() + 1,
		d: d.getDate()
	})} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` });
}
/** Hover-card body: workspace title, display directory path, absolute creation time. */
function WorkspaceHoverContent({ label, cwd, createdAt, t }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: Rows_module_css_default.hoverContent,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: Rows_module_css_default.hoverTitle,
				children: label
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: Rows_module_css_default.hoverPath,
				children: cwd
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: Rows_module_css_default.hoverTime,
				children: createdLabel(createdAt, t)
			})
		]
	});
}
/** Pointer-position half of a row (insert line above or below). */
function rowHalf(e) {
	const rect = e.currentTarget.getBoundingClientRect();
	return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
}
/**
* Project (workspace) header row: folder + title;
* hover reveals the chevron and create button, and dwelling on a real
* Workspace shows its hover card (the ungrouped bucket has none).
* `containsCurrent` arrives on the node (derivation fact, no renderer scan).
* @param props.group - derived group node.
* @param props.onToggle - expand/collapse the group.
* @param props.onCreate - start a frontend Session inside this Workspace.
* @param props.drag - optional workspace-row drag wiring.
* @param props.home - host account home for POSIX hover-path abbreviation.
* @param props.t - the browser root's locale seat.
* @returns the row element.
*/
function ProjectRowItem({ group, onToggle, onCreate, actions, drag, home, multiroot, t }) {
	const row = group;
	const label = multiroot?.logical.title ?? (row.workspaceId === void 0 ? t("group.ungrouped") : row.label);
	const active = group.expanded && group.containsCurrent;
	const [menuOpen, setMenuOpen] = (0, react.useState)(false);
	const workspaceMenuItems = [
		...actions?.manage === void 0 ? [] : [{
			id: "manage",
			label: t("multiroot.manage"),
			icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSettingsOutline16, {})
		}],
		{
			id: "rename",
			label: t("rename"),
			icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, {})
		},
		{
			id: "delete",
			label: t("delete.workspace"),
			icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {}),
			danger: true
		}
	];
	const ownRow = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: clsx(Rows_module_css_default.projectRow, multiroot !== void 0 && Rows_module_css_default.projectRowMultiroot, menuOpen && Rows_module_css_default.menuOpen),
		role: "treeitem",
		"aria-expanded": row.expanded,
		onClick: onToggle,
		draggable: drag !== void 0,
		onDragStart: drag === void 0 ? void 0 : (e) => {
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("text/plain", row.key);
			drag.start();
		},
		onDragEnd: drag?.end,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: clsx(Rows_module_css_default.slot, Rows_module_css_default.folder, active && Rows_module_css_default.folderActive),
				children: row.expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpen16, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderClose16, {})
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: clsx(Rows_module_css_default.slot, Rows_module_css_default.chevron),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTriangleRightFill14, { className: clsx(Rows_module_css_default.arrow, row.expanded && Rows_module_css_default.arrowOpen) })
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: Rows_module_css_default.projectText,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: Rows_module_css_default.title,
					children: label
				}), multiroot !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: Rows_module_css_default.projectMeta,
					children: t("multiroot.meta", {
						count: multiroot.rootCount,
						primary: multiroot.primaryAlias
					})
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: Rows_module_css_default.rowActions,
				children: [actions !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
					open: menuOpen,
					onClose: () => {
						setMenuOpen(false);
					},
					items: workspaceMenuItems,
					onSelect: (id) => {
						setMenuOpen(false);
						/* v8 ignore next -- Menu can emit only the rows supplied above. */
						if (id === "manage") {
							actions.manage?.();
							return;
						}
						if (id !== "rename" && id !== "delete") return;
						if (id === "rename") actions.rename();
						else actions.delete();
					},
					portal: true,
					closeOnPointerLeave: true,
					anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: Rows_module_css_default.iconButton,
						"aria-label": t("actions.workspace.aria", { name: label }),
						onClick: (e) => {
							e.stopPropagation();
							setMenuOpen((v) => !v);
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEllipsisOutline16, {})
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: Rows_module_css_default.iconButton,
					"aria-label": t("actions.newSession.aria", { name: label }),
					onClick: (e) => {
						e.stopPropagation();
						onCreate();
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, {})
				})]
			})
		]
	});
	if (row.createdAt === void 0) return ownRow;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.HoverCard, {
		anchor: ownRow,
		content: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceHoverContent, {
			label: row.label,
			cwd: row.cwd === void 0 ? void 0 : multiroot !== void 0 ? row.cwd : abbreviateHomePath(row.cwd, home),
			createdAt: row.createdAt,
			t
		}),
		disabled: menuOpen,
		copyText: row.cwd,
		copyLabel: t("copy"),
		copiedLabel: t("hover.copied")
	});
}
/* v8 ignore next 3 -- closed-union backstop; only reached if the status is forged */
function assertNever(value) {
	throw new Error(`unknown pending interaction: ${String(value)}`);
}
/**
* Session status presentation; pending interaction is primary and live activity
* outranks completion reminders.
*/
function sessionStatuses(node, t) {
	const subagents = node.runningSubagentCount === 0 ? void 0 : {
		state: "ongoing",
		label: t(node.runningSubagentCount === 1 ? "status.subagentsRunning.one" : "status.subagentsRunning.other", { n: node.runningSubagentCount })
	};
	let pending;
	switch (node.pendingInteraction) {
		case "approval":
			pending = {
				state: "warning",
				label: t("status.waitingApproval")
			};
			break;
		case "plan-review":
			pending = {
				state: "warning",
				label: t("status.planReview")
			};
			break;
		case "question":
			pending = {
				state: "warning",
				label: t("status.waitingAnswer")
			};
			break;
		case void 0: break;
		/* v8 ignore next -- closed PendingInteractionStatus union */
		default: return assertNever(node.pendingInteraction);
	}
	if (pending !== void 0) return subagents === void 0 ? [pending] : [pending, subagents];
	if (node.running) {
		const primary = {
			state: "ongoing",
			label: t("status.running")
		};
		return subagents === void 0 ? [primary] : [primary, subagents];
	}
	if (subagents !== void 0) return [subagents];
	if (node.completed) return [{
		state: "done",
		label: t("status.completed")
	}];
	return [{
		state: "done",
		label: t("status.idle")
	}];
}
/** Primary status dot plus every status's screen-reader label, shared by the search and session rows. */
function SessionStatusDots({ statuses }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: statuses[0].state }), statuses.map((status) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
		className: Rows_module_css_default.visuallyHidden,
		children: status.label
	}, status.label))] });
}
/** Non-interactive active-Schedule marker; the enclosing row remains the only action. */
function ActiveScheduleIndicator({ t, search = false }) {
	const label = t("schedule.active");
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
		className: clsx(Rows_module_css_default.scheduleIndicator, search && Rows_module_css_default.searchScheduleIndicator),
		role: "img",
		"aria-label": label,
		title: label,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconAlarmClockOutline16, {})
	});
}
/** Hover-card body: full title, relative time, and every relevant live status. */
function SessionHoverContent({ node, now, t }) {
	const statuses = sessionStatuses(node, t);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: Rows_module_css_default.hoverContent,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: Rows_module_css_default.hoverTitle,
				children: displayTitle(node, t)
			}),
			!node.blank && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: Rows_module_css_default.hoverTime,
				children: hoverTimeLabel(node.updatedAt, now, t)
			}),
			statuses.map((status) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: Rows_module_css_default.hoverStatus,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: status.state }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: status.label })]
			}, status.label))
		]
	});
}
/**
* One flat search result: title, Workspace context, and optional content
* excerpt. Search navigation opens the session only; it does not address an
* event inside the conversation.
* @param props.result - merged local/content search row.
* @param props.currentId - selected session id.
* @param props.onOpen - open the selected session.
* @param props.t - Workspace-browser translation seat.
* @returns the result button.
*/
function SearchResultItem({ result, currentId, onOpen, t }) {
	const selected = result.id === currentId;
	const statuses = sessionStatuses(result, t);
	const primaryStatus = statuses[0];
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
		type: "button",
		className: clsx(Rows_module_css_default.searchResultRow, selected && Rows_module_css_default.selected),
		role: "treeitem",
		"aria-selected": selected,
		onClick: () => {
			onOpen(result.id);
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
			className: Rows_module_css_default.searchResultHeading,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: Rows_module_css_default.slot,
					children: (primaryStatus.state !== "done" || result.completed) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionStatusDots, { statuses })
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: Rows_module_css_default.searchResultTitle,
					children: result.title
				}),
				result.hasActiveSchedule && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActiveScheduleIndicator, {
					t,
					search: true
				})
			]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
			className: Rows_module_css_default.searchResultMeta,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: Rows_module_css_default.searchResultWorkspace,
				children: result.workspace || t("group.ungrouped")
			}), result.snippet !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: Rows_module_css_default.searchResultSnippet,
				children: result.snippet
			})]
		})]
	});
}
/**
* One top-level 34px session row: status dot (pending user interaction outranks
* own or descendant activity), title, relative time, and the row actions menu.
* @param props.node - derived session node.
* @param props.currentId - selected session id (row highlight).
* @param props.now - epoch ms for relative-time formatting.
* @param props.onOpen - open a session by id.
* @param props.onRename - open the session rename dialog (id + current title).
* @param props.onFork - fork a session at its last completed turn.
* @param props.onArchive - archive a session by id.
* @param props.onReveal - scroll this row into view after search navigation, then acknowledge it.
* @param props.drag - optional draggable-row wiring.
* @param props.flat - omit the empty status slot in the hierarchy-free flat list.
* @param props.t - the browser root's locale seat.
* @returns the session row.
*/
function SessionNodeItem({ node, currentId, now, onOpen, onRename, onFork, onArchive, onReveal, drag, flat = false, t }) {
	const row = node;
	const title = displayTitle(node, t);
	const selected = node.id === currentId;
	const statuses = sessionStatuses(node, t);
	const showStatus = statuses[0].state !== "done" || row.completed;
	const [menuOpen, setMenuOpen] = (0, react.useState)(false);
	const rowRef = (0, react.useRef)(null);
	(0, react.useEffect)(() => {
		if (onReveal === void 0) return;
		rowRef.current?.scrollIntoView({ block: "nearest" });
		onReveal();
	}, [onReveal]);
	const sessionMenuItems = [
		{
			id: "rename",
			label: t("rename"),
			icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, {})
		},
		{
			id: "fork",
			label: t("menu.fork"),
			icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, {})
		},
		{
			id: "archive",
			label: t("menu.archiveSession"),
			icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconArchiveOutline20, { size: 16 })
		}
	];
	const ownRow = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		ref: rowRef,
		className: clsx(Rows_module_css_default.sessionRow, selected && Rows_module_css_default.selected, menuOpen && Rows_module_css_default.menuOpen, flat && !showStatus && Rows_module_css_default.flatSessionRowWithoutStatus, drag?.marker === "before" && Rows_module_css_default.dropBefore, drag?.marker === "after" && Rows_module_css_default.dropAfter),
		role: "treeitem",
		"aria-selected": selected,
		onClick: () => {
			onOpen(node.id);
		},
		draggable: drag !== void 0,
		onDragStart: drag === void 0 ? void 0 : (e) => {
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("text/plain", node.id);
			drag.start();
		},
		onDragEnd: drag?.end,
		onDragOver: drag === void 0 ? void 0 : (e) => {
			if (!drag.active) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
			drag.hover(rowHalf(e));
		},
		onDrop: drag === void 0 ? void 0 : (e) => {
			if (!drag.active) return;
			e.preventDefault();
			drag.drop(rowHalf(e));
		},
		children: [
			(!flat || showStatus) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: Rows_module_css_default.slot,
				children: showStatus && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionStatusDots, { statuses })
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: Rows_module_css_default.title,
				children: title
			}),
			row.hasActiveSchedule && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActiveScheduleIndicator, { t }),
			!row.blank && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: Rows_module_css_default.time,
				children: timeLabel(row.updatedAt, now, t)
			}),
			!row.blank && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: Rows_module_css_default.rowActions,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
					open: menuOpen,
					onClose: () => {
						setMenuOpen(false);
					},
					items: sessionMenuItems,
					onSelect: (id) => {
						setMenuOpen(false);
						if (id === "rename") onRename(node.id, row.title);
						if (id === "fork") onFork(node.id);
						if (id === "archive") onArchive(node.id);
					},
					portal: true,
					closeOnPointerLeave: true,
					anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: Rows_module_css_default.iconButton,
						"aria-label": t("actions.session.aria", { name: title }),
						onClick: (e) => {
							e.stopPropagation();
							setMenuOpen((v) => !v);
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEllipsisOutline16, {})
					})
				})
			})
		]
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.HoverCard, {
		anchor: ownRow,
		content: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionHoverContent, {
			node,
			now,
			t
		}),
		disabled: menuOpen || drag?.active === true,
		copyText: row.blank ? void 0 : row.title,
		copyLabel: t("copy"),
		copiedLabel: t("hover.copied")
	});
}

//#endregion
//#region src/client/multiroot/api.ts
const API_PREFIX = "/plugins/multiroot/api";
function isRecord(value) {
	return typeof value === "object" && value !== null;
}
function isEnvelope(value) {
	return isRecord(value) && typeof value.ok === "boolean";
}
function errorMessage(payload, status) {
	if (isEnvelope(payload) && payload.ok === false && isRecord(payload.error) && typeof payload.error.message === "string") return payload.error.message;
	return `multiroot request failed: ${status}`;
}
/** Send one same-origin request to the multiroot Host API. */
async function multirootRequest(path, init) {
	const response = await fetch(`${API_PREFIX}${path}`, init);
	const payload = await response.json();
	if (!isEnvelope(payload) || payload.ok !== true) throw new Error(errorMessage(payload, response.status));
	return payload.value;
}
function jsonRequest(path, method, body) {
	return multirootRequest(path, {
		method,
		headers: { "content-type": "application/json" },
		...body === void 0 ? {} : { body: JSON.stringify(body) }
	});
}
/** Typed mutations used by the multiroot dialogs. */
const multirootApi = {
	list: () => multirootRequest("/workspaces"),
	create: (input) => jsonRequest("/workspaces", "POST", input),
	update: (id, input) => jsonRequest(`/workspaces/${encodeURIComponent(id)}`, "PATCH", input),
	setPrimary: (id, alias) => jsonRequest(`/workspaces/${encodeURIComponent(id)}/primary`, "PUT", { alias }),
	delete: (id) => jsonRequest(`/workspaces/${encodeURIComponent(id)}`, "DELETE")
};
/** Load logical Workspace records while retaining the last ready snapshot after a failed refresh. */
function useMultirootRecords(enabled = true) {
	const [state, setState] = (0, react.useState)({
		phase: enabled ? "loading" : "ready",
		records: [],
		error: null
	});
	const refresh = (0, react.useCallback)(async () => {
		if (!enabled) return;
		try {
			const records = await multirootApi.list();
			setState({
				phase: "ready",
				records,
				error: null
			});
		} catch (cause) {
			setState((previous) => ({
				phase: "error",
				records: previous.records,
				error: cause instanceof Error ? cause.message : String(cause)
			}));
			throw cause;
		}
	}, [enabled]);
	(0, react.useEffect)(() => {
		refresh().catch(() => {});
	}, [refresh]);
	return {
		...state,
		refresh
	};
}

//#endregion
//#region src/client/multiroot/join.ts
/** Join logical metadata to Host Workspaces without path inference. */
function joinMultiroot(workspaces, records) {
	const workspaceIds = new Set(workspaces.map((workspace) => workspace.workspaceId));
	const metadataByWorkspaceId = /* @__PURE__ */ new Map();
	const missingShadowIds = [];
	for (const logical of records) {
		if (!workspaceIds.has(logical.shadowWorkspaceId)) {
			missingShadowIds.push(logical.id);
			continue;
		}
		const primary = logical.roots.find((root) => root.primary);
		if (primary === void 0) continue;
		metadataByWorkspaceId.set(logical.shadowWorkspaceId, {
			logical,
			rootCount: logical.roots.length,
			primaryAlias: primary.alias
		});
	}
	return {
		workspaces: [...workspaces],
		metadataByWorkspaceId,
		missingShadowIds
	};
}

//#endregion
//#region \0dsh-css:src/client/multiroot/Dialogs.module.css.mjs
const css$2 = ".dJwC2G_dialog{width:min(760px,100%);max-height:calc(100dvh - 48px)}.dJwC2G_dialogContent{min-height:0}.dJwC2G_form{flex-direction:column;gap:16px;width:100%;min-width:0;display:flex}.dJwC2G_field{color:var(--dsw-alias-label-primary);flex-direction:column;gap:6px;font-size:13px;display:flex}.dJwC2G_input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-elevated-fill);width:100%;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;outline:none;padding:8px 10px}.dJwC2G_input:focus{border-color:var(--dsw-alias-state-business-primary)}.dJwC2G_rootList{border-block:1px solid var(--dsw-alias-border-l2);min-height:0;overflow:hidden}.dJwC2G_rootListHeader{color:var(--dsw-alias-label-tertiary);justify-content:space-between;padding:8px 4px;font-size:12px;display:flex}.dJwC2G_rootScroller{overscroll-behavior:contain;scrollbar-gutter:stable;flex-direction:column;gap:8px;max-height:clamp(160px,100dvh - 390px,390px);padding:0 4px 8px;display:flex;overflow-y:auto}.dJwC2G_rootRow{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:12px}.dJwC2G_rootFields{grid-template-columns:minmax(180px,.7fr) minmax(260px,1.3fr);gap:12px;display:grid}.dJwC2G_rootPath{overflow-wrap:anywhere;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);min-width:0;min-height:36px;color:var(--dsw-alias-label-secondary);user-select:text;border-radius:8px;padding:8px 10px;font-size:12px;line-height:18px;display:block}.dJwC2G_rootActions{justify-content:space-between;align-items:center;gap:8px;margin-top:10px;display:flex}.dJwC2G_primary,.dJwC2G_makePrimary{align-items:center;gap:7px;font-size:12px;display:inline-flex}.dJwC2G_primary{color:var(--dsw-alias-label-primary)}.dJwC2G_radio,.dJwC2G_radioSelected{border:1px solid var(--dsw-alias-border-l1);border-radius:50%;width:14px;height:14px}.dJwC2G_radioSelected{border:4px solid var(--dsw-alias-state-business-primary)}.dJwC2G_removeButton{color:var(--dsw-alias-state-error-primary);margin-left:auto}.dJwC2G_error{color:var(--dsw-alias-state-error-primary);font-size:12px}.dJwC2G_hint{color:var(--dsw-alias-label-tertiary);font-size:12px}@media (width<=680px){.dJwC2G_rootFields{grid-template-columns:1fr}}";
const tagId$2 = "dsh-multiroot-workspace/Dialogs.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
	const tag = document.createElement("style");
	tag.dataset.plugin = "dsh-multiroot-workspace";
	tag.dataset.pluginCss = tagId$2;
	tag.textContent = css$2;
	document.head.appendChild(tag);
}
var Dialogs_module_css_default = {
	"dialog": "dJwC2G_dialog",
	"dialogContent": "dJwC2G_dialogContent",
	"error": "dJwC2G_error",
	"field": "dJwC2G_field",
	"form": "dJwC2G_form",
	"hint": "dJwC2G_hint",
	"input": "dJwC2G_input",
	"makePrimary": "dJwC2G_makePrimary",
	"primary": "dJwC2G_primary",
	"radio": "dJwC2G_radio",
	"radioSelected": "dJwC2G_radioSelected",
	"removeButton": "dJwC2G_removeButton",
	"rootActions": "dJwC2G_rootActions",
	"rootFields": "dJwC2G_rootFields",
	"rootList": "dJwC2G_rootList",
	"rootListHeader": "dJwC2G_rootListHeader",
	"rootPath": "dJwC2G_rootPath",
	"rootRow": "dJwC2G_rootRow",
	"rootScroller": "dJwC2G_rootScroller"
};

//#endregion
//#region src/client/multiroot/Dialogs.tsx
function basename(path) {
	return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}
function uniqueAlias(path, roots) {
	const base = basename(path) || "root";
	let alias = base;
	let suffix = 2;
	const used = new Set(roots.map((root) => root.alias.toLowerCase()));
	while (used.has(alias.toLowerCase())) alias = `${base}-${suffix++}`;
	return alias;
}
function MultirootDialog({ open, record, onClose, refresh, renderDirectoryFlow, t }) {
	const [title, setTitle] = (0, react.useState)("");
	const [roots, setRoots] = (0, react.useState)([]);
	const [picking, setPicking] = (0, react.useState)(false);
	const [saving, setSaving] = (0, react.useState)(false);
	const [error, setError] = (0, react.useState)(null);
	(0, react.useEffect)(() => {
		if (!open) return;
		setTitle(record?.title ?? "");
		setRoots(record?.roots.map((root) => ({ ...root })) ?? []);
		setPicking(false);
		setSaving(false);
		setError(null);
	}, [open, record]);
	const appendRoot = (path) => {
		setRoots((current) => {
			if (current.some((root) => root.path === path)) return current;
			const alias = uniqueAlias(path, current);
			if (current.length === 0 && title.trim() === "") setTitle(alias);
			return [...current, {
				alias,
				path,
				primary: current.length === 0
			}];
		});
		setPicking(false);
	};
	const save = async () => {
		if (saving || title.trim() === "" || roots.length === 0) return;
		setSaving(true);
		setError(null);
		try {
			if (record === null) await multirootApi.create({
				title: title.trim(),
				roots
			});
			else {
				const oldPrimary = record.roots.find((root) => root.primary)?.alias;
				const nextPrimary = roots.find((root) => root.primary)?.alias;
				const rootsWithOldPrimary = roots.map((root) => ({
					...root,
					primary: root.alias.toLowerCase() === oldPrimary?.toLowerCase()
				}));
				await multirootApi.update(record.id, {
					title: title.trim(),
					roots: rootsWithOldPrimary
				});
				if (nextPrimary !== void 0 && nextPrimary.toLowerCase() !== oldPrimary?.toLowerCase()) await multirootApi.setPrimary(record.id, nextPrimary);
			}
			await refresh();
			onClose();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setSaving(false);
		}
	};
	const remove = (index) => {
		setRoots((current) => {
			const next = current.filter((_, candidate) => candidate !== index);
			if (next.length > 0 && !next.some((root) => root.primary)) next[0] = {
				...next[0],
				primary: true
			};
			return next;
		});
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
		open,
		onClose: () => {
			if (!saving) onClose();
		},
		closeLabel: t("close"),
		title: record === null ? t("multiroot.add") : t("multiroot.manage.title"),
		className: Dialogs_module_css_default.dialog,
		contentClassName: Dialogs_module_css_default.dialogContent,
		footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
			record !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				variant: "outline",
				disabled: saving,
				onClick: () => {
					setSaving(true);
					multirootApi.delete(record.id).then(refresh).then(onClose).catch((cause) => {
						setError(cause instanceof Error ? cause.message : String(cause));
						setSaving(false);
					});
				},
				children: t("multiroot.delete")
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				variant: "outline",
				disabled: saving,
				onClick: onClose,
				children: t("cancel")
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				variant: "primary",
				disabled: saving || title.trim() === "" || roots.length === 0,
				onClick: () => {
					save();
				},
				children: record === null ? t("multiroot.create") : t("save")
			})
		] }),
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: Dialogs_module_css_default.form,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
					className: Dialogs_module_css_default.field,
					children: [t("field.workspaceName"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: Dialogs_module_css_default.input,
						"aria-label": t("field.workspaceName"),
						value: title,
						onChange: (event) => {
							setTitle(event.target.value);
						}
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: Dialogs_module_css_default.rootList,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Dialogs_module_css_default.rootListHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("multiroot.roots") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("multiroot.rootCount", { count: roots.length }) })]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Dialogs_module_css_default.rootScroller,
						role: "region",
						"aria-label": t("multiroot.roots"),
						children: [roots.map((root, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: Dialogs_module_css_default.rootRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: Dialogs_module_css_default.rootFields,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: Dialogs_module_css_default.field,
									children: [t("multiroot.directoryName"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: Dialogs_module_css_default.input,
										"aria-label": t("multiroot.alias", { n: index + 1 }),
										value: root.alias,
										onChange: (event) => {
											const alias = event.target.value;
											setRoots((current) => current.map((item, candidate) => candidate === index ? {
												...item,
												alias
											} : item));
										}
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: Dialogs_module_css_default.field,
									children: [t("multiroot.directoryPath"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: Dialogs_module_css_default.rootPath,
										title: root.path,
										children: root.path
									})]
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: Dialogs_module_css_default.rootActions,
								children: [root.primary ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: Dialogs_module_css_default.primary,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: Dialogs_module_css_default.radioSelected,
										"aria-hidden": "true"
									}), t("multiroot.currentPrimary")]
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "ghost",
									size: "sm",
									disabled: saving,
									onClick: () => {
										setRoots((current) => current.map((item, candidate) => ({
											...item,
											primary: candidate === index
										})));
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: Dialogs_module_css_default.makePrimary,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: Dialogs_module_css_default.radio,
											"aria-hidden": "true"
										}), t("multiroot.makePrimary", { name: root.alias })]
									})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									className: Dialogs_module_css_default.removeButton,
									variant: "ghost",
									size: "sm",
									disabled: saving || roots.length === 1,
									onClick: () => {
										remove(index);
									},
									children: t("multiroot.remove")
								})]
							})]
						}, `${root.path}:${index}`)), roots.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: Dialogs_module_css_default.hint,
							children: t("multiroot.empty")
						})]
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					disabled: saving || picking,
					onClick: () => {
						setPicking(true);
					},
					children: t("multiroot.addFolder")
				}),
				error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: Dialogs_module_css_default.error,
					children: error
				})
			]
		})
	}), renderDirectoryFlow({
		open: open && picking,
		busy: saving,
		onPicked: appendRoot,
		onCancel: () => {
			setPicking(false);
		},
		onError: (message) => {
			setPicking(false);
			setError(message);
		}
	})] });
}

//#endregion
//#region \0dsh-css:src/client/WorkspacePicker.module.css.mjs
const css$1 = ".S_JYgq_modalAction{min-width:72px}.S_JYgq_modalError,.S_JYgq_menuStatus{margin-top:8px;font-size:12px;line-height:18px}.S_JYgq_modalError{color:var(--dsw-alias-state-error-primary)}.S_JYgq_menuStatus{color:var(--dsw-alias-label-secondary)}";
const tagId$1 = "dsh-multiroot-workspace/WorkspacePicker.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
	const tag = document.createElement("style");
	tag.dataset.plugin = "dsh-multiroot-workspace";
	tag.dataset.pluginCss = tagId$1;
	tag.textContent = css$1;
	document.head.appendChild(tag);
}
var WorkspacePicker_module_css_default = {
	"menuStatus": "S_JYgq_menuStatus",
	"modalAction": "S_JYgq_modalAction",
	"modalError": "S_JYgq_modalError"
};

//#endregion
//#region src/client/WorkspacePicker.tsx
const ADD_WORKSPACE = "::add-workspace";
/**
* Render the pick menu plus the adoption error dialog.
* @param props - owner-controlled flow props.
* @returns menu + dialog elements.
*/
function WorkspacePickFlow({ t, open, anchorRef, useWorkspaces, createWorkspace, useDirectoryFlow, renderDirectoryFlow, onPick, onClose, addOnly = false, side = "bottom", selectedId }) {
	const workspaceSnapshot = useWorkspaces((state) => state);
	const workspaces = workspaceSnapshot.items;
	const getAnchorRect = (0, react.useCallback)(() => anchorRef?.current?.getBoundingClientRect() ?? null, [anchorRef]);
	const [errorOpen, setErrorOpen] = (0, react.useState)(false);
	const [modalError, setModalError] = (0, react.useState)(null);
	const [flowOpen, setFlowOpen] = (0, react.useState)(false);
	const [pickingFolder, setPickingFolder] = (0, react.useState)(false);
	const flowBusy = flowOpen || pickingFolder;
	const flowAvailable = useDirectoryFlow((occupied) => occupied);
	(0, react.useEffect)(() => {
		if (flowOpen && !flowAvailable) setFlowOpen(false);
	}, [flowOpen, flowAvailable]);
	const addEntries = flowAvailable ? [{
		id: ADD_WORKSPACE,
		label: t("menu.addWorkspace"),
		icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 16 }),
		disabled: flowBusy
	}] : [];
	const pinAdd = !addOnly && workspaces.length > 0;
	const items = pinAdd ? workspaces.map((workspace) => ({
		id: workspace.workspaceId,
		label: workspace.title,
		icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderClose16, { size: 16 }),
		disabled: flowBusy
	})) : addEntries;
	const menuIsEmpty = items.length === 0;
	const closeModal = () => {
		setErrorOpen(false);
		setModalError(null);
	};
	/** Adopt a picked directory; failures land in the folder-error dialog (Choose again reopens the flow). */
	const adoptDirectory = (path) => createWorkspace({ path }).then((workspace) => {
		setFlowOpen(false);
		onPick(workspace.workspaceId);
	}).catch((reason) => {
		setModalError(reason instanceof Error ? reason.message : String(reason));
		setFlowOpen(false);
		setErrorOpen(true);
	});
	const openDirectoryFlow = (0, react.useCallback)(() => {
		onClose();
		setErrorOpen(false);
		setModalError(null);
		setFlowOpen(true);
	}, [onClose]);
	const listSettled = addOnly || workspaceSnapshot.phase === "ready";
	const addIsTheOnlyEntry = !pinAdd && listSettled && addEntries.length === 1;
	(0, react.useEffect)(() => {
		if (open && addIsTheOnlyEntry && !flowBusy) openDirectoryFlow();
	}, [
		open,
		addIsTheOnlyEntry,
		flowBusy,
		openDirectoryFlow
	]);
	/** Owner side of the flow conversation: adopt keeps the flow open (busy) until the Host answers. */
	const flowOwner = {
		open: flowOpen,
		busy: pickingFolder,
		onPicked: (path) => {
			setPickingFolder(true);
			adoptDirectory(path).finally(() => {
				setPickingFolder(false);
			});
		},
		onCancel: () => {
			setFlowOpen(false);
		},
		onError: (message) => {
			setFlowOpen(false);
			setModalError(message);
			setErrorOpen(true);
		}
	};
	const handleSelect = (id) => {
		if (id === ADD_WORKSPACE) {
			openDirectoryFlow();
			return;
		}
		onPick(id);
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
			open: open && !addIsTheOnlyEntry && !menuIsEmpty,
			anchor: null,
			items,
			...pinAdd ? { footer: addEntries } : {},
			selectedId,
			onSelect: handleSelect,
			onClose,
			side,
			portal: true,
			getAnchorRect
		}),
		open && !addIsTheOnlyEntry && !menuIsEmpty && workspaceSnapshot.phase === "pending" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: WorkspacePicker_module_css_default.menuStatus,
			role: "status",
			children: t("picker.loading")
		}),
		renderDirectoryFlow(flowOwner),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
			open: errorOpen,
			onClose: closeModal,
			closeLabel: t("close"),
			title: t("folderError.title"),
			footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				variant: "outline",
				className: WorkspacePicker_module_css_default.modalAction,
				onClick: closeModal,
				children: t("cancel")
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				variant: "primary",
				className: WorkspacePicker_module_css_default.modalAction,
				disabled: !flowAvailable,
				onClick: openDirectoryFlow,
				children: t("folderError.retry")
			})] }),
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: WorkspacePicker_module_css_default.modalError,
				role: "alert",
				children: modalError
			})
		})
	] });
}
/**
* The conversation empty-state registration: adapts the owner share to the
* core flow (all state and semantics live in the flow / the owner).
* @param props - empty-state slot props (owner share + injected creation callback).
* @returns the flow element.
*/
function WorkspacePicker({ open, anchorRef, useWorkspaces, selectedId, onPick, onClose, createWorkspace, useDirectoryFlow, renderSlot, t }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspacePickFlow, {
		t,
		open,
		anchorRef,
		useWorkspaces,
		createWorkspace,
		useDirectoryFlow,
		renderDirectoryFlow: (owner) => renderSlot("conversation.hero.workspace.directoryFlow", owner),
		selectedId,
		onPick,
		onClose
	});
}

//#endregion
//#region \0dsh-css:src/client/rows/WorkspaceBrowser.module.css.mjs
const css = ".QAYkWG_root{--dsh-session-list-edge-inset:var(--dsh-sidebar-inline-padding);--dsh-session-list-scrollbar-width:8px;--dsh-session-list-scrollbar-offset:2px;box-sizing:border-box;min-height:0;padding-right:var(--dsh-session-list-edge-inset);flex-direction:column;flex:1;display:flex}.QAYkWG_root.QAYkWG_rail{padding-right:0}.QAYkWG_iconButton{corner-shape:round;cursor:pointer;width:28px;height:28px;color:var(--dsw-alias-label-secondary);background:0 0;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.QAYkWG_iconButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.QAYkWG_sectionHeader{box-sizing:border-box;height:36px;color:var(--dsw-alias-label-tertiary);border-radius:12px;flex:none;justify-content:flex-end;align-items:center;gap:4px;margin-bottom:4px;padding-left:4px;display:flex;overflow:hidden}.QAYkWG_root:not(.QAYkWG_rail) .QAYkWG_sectionHeader{margin-top:2px;margin-right:-4px}.QAYkWG_sectionLabel{white-space:nowrap;opacity:1;visibility:visible;min-width:0;max-width:45%;transition:max-width .18s var(--ds-ease-in-out), margin-right .18s var(--ds-ease-in-out), opacity .12s var(--ds-ease-in-out), transform .18s var(--ds-ease-in-out), visibility 0s linear;flex:none;line-height:20px;overflow:hidden}.QAYkWG_sectionLabelHidden{opacity:0;visibility:hidden;max-width:0;margin-right:-4px;transition-delay:0s,0s,0s,0s,.18s;transform:translate(-4px)}.QAYkWG_searchSlot{box-sizing:border-box;min-width:0;max-width:28px;transition:max-width .18s var(--ds-ease-in-out), padding-left .18s var(--ds-ease-in-out);flex:1;align-items:center;margin-left:auto;padding-left:0;display:flex}.QAYkWG_searchSlotExpanded{max-width:100%;padding-left:0}.QAYkWG_headerActions{opacity:1;visibility:visible;max-width:92px;transition:max-width .18s var(--ds-ease-in-out), opacity .12s var(--ds-ease-in-out), transform .18s var(--ds-ease-in-out), visibility 0s linear;flex:none;align-items:center;gap:4px;display:flex;overflow:hidden}.QAYkWG_multirootError{color:var(--dsw-alias-state-error-primary);padding:4px 8px;font-size:12px;line-height:18px}.QAYkWG_headerActionsHidden{opacity:0;visibility:hidden;pointer-events:none;max-width:0;transition-delay:0s,0s,0s,.18s;transform:translate(4px)}.QAYkWG_search{box-sizing:border-box;corner-shape:round;cursor:text;width:100%;height:28px;color:var(--dsw-alias-label-secondary);transition:width .18s var(--ds-ease-in-out), padding .18s var(--ds-ease-in-out), border-color .18s var(--ds-ease-in-out), background-color .18s var(--ds-ease-in-out);background:0 0;border:none;border-radius:50%;flex:none;align-items:center;gap:0;margin:0;padding:0;display:flex;overflow:hidden}.QAYkWG_searchExpanded{border:.5px solid var(--dsw-alias-border-l4);width:calc(100% + 4px);height:30px;color:var(--dsw-alias-label-caption);background:0 0;border-radius:10px;margin-inline:-2px;padding:0 4px 0 0}.QAYkWG_searchButton{corner-shape:round;cursor:pointer;width:28px;height:28px;color:inherit;background:0 0;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.QAYkWG_searchExpanded .QAYkWG_searchButton{width:28px;height:30px}.QAYkWG_searchButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.QAYkWG_searchExpanded .QAYkWG_searchButton:hover{background:0 0}.QAYkWG_searchInput{opacity:0;pointer-events:none;width:0;min-width:0;color:var(--dsw-alias-label-primary);transition:opacity .12s var(--ds-ease-in-out);background:0 0;border:none;outline:none;flex:1;font-size:13px;line-height:18px}.QAYkWG_searchExpanded .QAYkWG_searchInput{opacity:1;pointer-events:auto;margin-left:-2px}.QAYkWG_searchInput::placeholder{color:var(--dsw-alias-label-tertiary)}.QAYkWG_clearButton{corner-shape:round;cursor:pointer;width:24px;height:24px;color:var(--dsw-alias-label-secondary);background:0 0;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.QAYkWG_clearButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.QAYkWG_rail .QAYkWG_sectionHeader{justify-content:flex-start;gap:0;margin-bottom:12px;padding-left:0}.QAYkWG_rail .QAYkWG_headerActions{max-width:none}.QAYkWG_rail .QAYkWG_iconButton{width:36px;height:36px;color:var(--dsw-alias-label-primary)}.QAYkWG_rail .QAYkWG_search{background:0 0;border-color:#0000;gap:0;width:36px;height:36px;margin:0 0 12px;padding:0}.QAYkWG_rail .QAYkWG_searchButton{width:36px;height:36px;color:var(--dsw-alias-label-primary)}.QAYkWG_rail .QAYkWG_searchButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.QAYkWG_listArea{min-height:0;margin-left:-4px;margin-right:calc(-1 * var(--dsh-session-list-edge-inset));flex-direction:column;flex:1;padding-left:4px;display:flex;overflow:visible}.QAYkWG_rail .QAYkWG_listArea{margin-left:0;margin-right:0;padding-left:0}.QAYkWG_treeBody{flex-direction:column;flex:1;min-height:0;display:flex;position:relative}.QAYkWG_fade{left:0;right:var(--dsh-session-list-edge-inset);background:linear-gradient(to bottom, transparent, var(--dsw-specific-sidebar-fill));pointer-events:none;height:24px;position:absolute;bottom:0}.QAYkWG_wide{animation:QAYkWG_wide-in .2s var(--ds-ease-in-out)}@keyframes QAYkWG_wide-in{0%{opacity:0}}.QAYkWG_list{min-height:0;margin-left:-4px;margin-right:var(--dsh-session-list-scrollbar-offset);padding-left:4px;padding-right:calc(var(--dsh-session-list-edge-inset) - var(--dsh-session-list-scrollbar-width) - var(--dsh-session-list-scrollbar-offset));scrollbar-gutter:stable;flex:1;padding-bottom:16px;overflow-y:auto}.QAYkWG_flatList>*+*,.QAYkWG_searchTree>[role=treeitem]+[role=treeitem],.QAYkWG_groupSection>*+*{margin-top:2px}.QAYkWG_searchStatus,.QAYkWG_searchWarning{color:var(--dsw-alias-label-tertiary);padding:10px 12px;font-size:12px;line-height:18px}.QAYkWG_searchWarning{color:var(--dsw-alias-label-secondary)}.QAYkWG_groupSection{position:relative}.QAYkWG_groupSection+.QAYkWG_groupSection{margin-top:4px}.QAYkWG_listTopDropIndicator,.QAYkWG_workspaceDropBefore:before,.QAYkWG_workspaceDropAfter:after{content:\"\";z-index:1;background:linear-gradient(55deg, transparent calc(50% - 1px), var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) 0 0 / 5px 7px no-repeat, linear-gradient(125deg, transparent calc(50% - 1px), var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) 0 5px / 5px 7px no-repeat, linear-gradient(var(--dsw-alias-state-business-primary) 0 0) 4px 5px / calc(100% - 4px) 2px no-repeat;pointer-events:none;height:12px;position:absolute;left:0;right:0}.QAYkWG_listTopDropIndicator{top:-8px;left:0;right:var(--dsh-session-list-edge-inset)}.QAYkWG_listTopDropActive>.QAYkWG_workspaceDropBefore:first-child:before{display:none}.QAYkWG_workspaceDropBefore:before{top:-8px}.QAYkWG_workspaceDropAfter:after{bottom:-8px}.QAYkWG_sessionOverflowButton{cursor:pointer;text-align:left;width:100%;height:28px;color:var(--dsw-alias-label-tertiary);background:0 0;border:none;border-radius:8px;padding:0 12px 0 28px;font-size:12px}.QAYkWG_groupSection>.QAYkWG_sessionOverflowButton{margin-top:0}.QAYkWG_sessionOverflowButton:hover{color:var(--dsw-alias-label-secondary);background:0 0}.QAYkWG_empty{color:var(--dsw-alias-label-tertiary);padding:16px 12px;font-size:13px}.QAYkWG_renameInput{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);width:100%;height:44px;color:var(--dsw-alias-label-primary);background:0 0;border-radius:22px;outline:none;padding:7px 14px;font-size:14px;font-weight:400;line-height:22px}.QAYkWG_renameInput:disabled{color:var(--dsw-alias-label-dimmed)}.QAYkWG_renameError{color:var(--dsw-alias-state-error-primary);margin-top:8px;font-size:12px;line-height:18px}.QAYkWG_deleteAction:not(:disabled){color:var(--dsw-alias-state-error-primary)}.QAYkWG_deleteStatus{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}@media (prefers-reduced-motion:reduce){.QAYkWG_wide{animation:none}.QAYkWG_search,.QAYkWG_sectionLabel,.QAYkWG_searchSlot,.QAYkWG_searchInput,.QAYkWG_headerActions{transition:none}}";
const tagId = "dsh-multiroot-workspace/WorkspaceBrowser.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
	const tag = document.createElement("style");
	tag.dataset.plugin = "dsh-multiroot-workspace";
	tag.dataset.pluginCss = tagId;
	tag.textContent = css;
	document.head.appendChild(tag);
}
var WorkspaceBrowser_module_css_default = {
	"clearButton": "QAYkWG_clearButton",
	"deleteAction": "QAYkWG_deleteAction",
	"deleteStatus": "QAYkWG_deleteStatus",
	"empty": "QAYkWG_empty",
	"fade": "QAYkWG_fade",
	"flatList": "QAYkWG_flatList",
	"groupSection": "QAYkWG_groupSection",
	"headerActions": "QAYkWG_headerActions",
	"headerActionsHidden": "QAYkWG_headerActionsHidden",
	"iconButton": "QAYkWG_iconButton",
	"list": "QAYkWG_list",
	"listArea": "QAYkWG_listArea",
	"listTopDropActive": "QAYkWG_listTopDropActive",
	"listTopDropIndicator": "QAYkWG_listTopDropIndicator",
	"multirootError": "QAYkWG_multirootError",
	"rail": "QAYkWG_rail",
	"renameError": "QAYkWG_renameError",
	"renameInput": "QAYkWG_renameInput",
	"root": "QAYkWG_root",
	"search": "QAYkWG_search",
	"searchButton": "QAYkWG_searchButton",
	"searchExpanded": "QAYkWG_searchExpanded",
	"searchInput": "QAYkWG_searchInput",
	"searchSlot": "QAYkWG_searchSlot",
	"searchSlotExpanded": "QAYkWG_searchSlotExpanded",
	"searchStatus": "QAYkWG_searchStatus",
	"searchTree": "QAYkWG_searchTree",
	"searchWarning": "QAYkWG_searchWarning",
	"sectionHeader": "QAYkWG_sectionHeader",
	"sectionLabel": "QAYkWG_sectionLabel",
	"sectionLabelHidden": "QAYkWG_sectionLabelHidden",
	"sessionOverflowButton": "QAYkWG_sessionOverflowButton",
	"treeBody": "QAYkWG_treeBody",
	"wide": "QAYkWG_wide",
	"wide-in": "QAYkWG_wide-in",
	"workspaceDropAfter": "QAYkWG_workspaceDropAfter",
	"workspaceDropBefore": "QAYkWG_workspaceDropBefore"
};

//#endregion
//#region src/client/rows/WorkspaceBrowser.tsx
/**
* The workspace/session browsing region filling the sidebar shell's
* `sidebar.workspaces` hole: section header (title + view options + add
* workspace), search, the grouped tree or flat list, and the workspace
* dialogs. Wide state renders the full browser; rail state renders the two
* region icons (search / add workspace) as 36px controls on the shell's shared
* rail entry path, each requesting expansion through the owner share. Adding
* is the header button's one action, so it raises the directory flow with no
* menu in between; the flow and its error dialog live in WorkspacePicker
* (same package — direct composition, no slot between them).
*/
/**
* Column slide length (--ds-transition-duration-slow): rail-search focus waits it out —
* focus() forces a synchronous layout and would jank the slide.
*/
const EXPAND_SLIDE_MS = 300;
/** Pause between the latest keystroke and a Host content-search request. */
const SEARCH_DEBOUNCE_MS = 250;
/** `session.search` wire bound, measured in JavaScript UTF-16 code units. */
const SEARCH_QUERY_MAX_CODE_UNITS = 500;
/** Session rows visible per Workspace before the local overflow control. */
const COLLAPSED_SESSION_LIMIT = 5;
/** Fold one Workspace without charging its provisional New Session against the ordinary-row limit. */
function collapsedSessionRows(sessions) {
	let ordinaryCount = 0;
	const rows = sessions.filter((session) => {
		if (session.blank) return true;
		if (ordinaryCount >= COLLAPSED_SESSION_LIMIT) return false;
		ordinaryCount += 1;
		return true;
	});
	return {
		rows,
		hiddenCount: sessions.length - rows.length
	};
}
/** Keep controlled input and RPC payload inside the session.search wire contract. */
function sanitizeSearchQuery(value) {
	const withoutNul = value.replaceAll("\0", "");
	if (withoutNul.length <= SEARCH_QUERY_MAX_CODE_UNITS) return withoutNul;
	let end = SEARCH_QUERY_MAX_CODE_UNITS;
	const last = withoutNul.charCodeAt(end - 1);
	const next = withoutNul.charCodeAt(end);
	if (last >= 55296 && last <= 56319 && next >= 56320 && next <= 57343) end--;
	return withoutNul.slice(0, end);
}
/** Immutable membership toggle for the local expand-all array. */
function toggled(list, key) {
	return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}
/**
* Accept the native drag at document level while a row drag is active: row
* hover still owns the insertion marker, and releasing outside the list must
* not be rendered as a rejected drop before dragend commits that last marker.
*/
function useNativeDragAcceptance(active) {
	(0, react.useEffect)(() => {
		if (!active) return;
		const acceptDrag = (event) => {
			event.preventDefault();
			if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
		};
		const acceptDrop = (event) => {
			event.preventDefault();
		};
		document.addEventListener("dragover", acceptDrag);
		document.addEventListener("drop", acceptDrop);
		return () => {
			document.removeEventListener("dragover", acceptDrag);
			document.removeEventListener("drop", acceptDrop);
		};
	}, [active]);
}
/** Reconcile a stored view order with the Workspace's current session account. */
function reconciledSessionOrder(sessionIds, stored) {
	if (stored === void 0) return [...sessionIds];
	const byId = new Map(sessionIds.map((id) => [id, id]));
	const ordered = [];
	const included = /* @__PURE__ */ new Set();
	for (const key of stored) {
		const id = byId.get(key);
		if (id === void 0 || included.has(key)) continue;
		ordered.push(id);
		included.add(key);
	}
	for (const id of sessionIds) {
		if (included.has(id)) continue;
		ordered.push(id);
	}
	return ordered;
}
/** Newest update first with stable Session identity as the tie-break. */
function compareSessionRecency(a, b, byId) {
	const aUpdatedAt = byId[a]?.updatedAt ?? Number.NEGATIVE_INFINITY;
	const bUpdatedAt = byId[b]?.updatedAt ?? Number.NEGATIVE_INFINITY;
	if (aUpdatedAt !== bUpdatedAt) return bUpdatedAt - aUpdatedAt;
	return a < b ? -1 : 1;
}
/** Reconcile one editable order account and apply its activity-promotion policy. */
function nextSessionOrderAccount({ sessionIds, previousOrder, previousUpdatedAt, list, orderBy, sortByRecency }) {
	let order = reconciledSessionOrder(sessionIds, previousOrder);
	if (sortByRecency) order.sort((a, b) => compareSessionRecency(a, b, list.byId));
	else if (orderBy === "updated") {
		const promoted = sessionIds.filter((id) => {
			const session = list.byId[id];
			return session !== void 0 && (previousUpdatedAt[id] === void 0 || session.updatedAt > previousUpdatedAt[id]);
		}).sort((a, b) => compareSessionRecency(a, b, list.byId));
		if (promoted.length > 0) {
			const promotedIds = new Set(promoted);
			order = [...promoted, ...order.filter((id) => !promotedIds.has(id))];
		}
	}
	const updatedAt = {};
	for (const id of sessionIds) {
		const session = list.byId[id];
		if (session !== void 0) updatedAt[id] = session.updatedAt;
	}
	const orderChanged = previousOrder === void 0 || order.length !== previousOrder.length || order.some((id, index) => id !== previousOrder[index]);
	const timestampsChanged = Object.keys(updatedAt).length !== Object.keys(previousUpdatedAt).length || Object.entries(updatedAt).some(([id, timestamp]) => previousUpdatedAt[id] !== timestamp);
	return {
		order,
		updatedAt,
		changed: orderChanged || timestampsChanged
	};
}
/** Grouping and ordering menu; own open state so it resets with the wide chrome. */
function ViewOptionsMenu({ groupBy, orderBy, onGroupPick, onOrderPick, t }) {
	const [open, setOpen] = (0, react.useState)(false);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
		open,
		onClose: () => {
			setOpen(false);
		},
		items: [
			{
				type: "label",
				id: "group-by",
				text: t("groupBy.label")
			},
			{
				id: "workspace",
				label: t("groupBy.workspace")
			},
			{
				id: "flat",
				label: t("groupBy.flat")
			},
			{
				type: "separator",
				id: "order-by-separator"
			},
			{
				type: "label",
				id: "order-by",
				text: t("orderBy.label")
			},
			{
				id: "manual",
				label: t("orderBy.manual")
			},
			{
				id: "updated",
				label: t("orderBy.updated")
			}
		],
		selectedIds: [groupBy, orderBy],
		onSelect: (id) => {
			if (id === "workspace" || id === "flat") onGroupPick(id);
			else if (id === "manual" || id === "updated") onOrderPick(id);
			setOpen(false);
		},
		align: "end",
		dense: true,
		portal: true,
		anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
			label: t("viewOptions.label"),
			side: "bottom",
			delayMs: 500,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: clsx(WorkspaceBrowser_module_css_default.iconButton, WorkspaceBrowser_module_css_default.wide),
				"aria-label": t("viewOptions.label"),
				onClick: () => {
					setOpen((v) => !v);
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPersonalizationOutline16, {})
			})
		})
	});
}
/** Resolve an insertion side from the full rendered workspace group. */
function workspaceGroupHalf(e) {
	const rect = e.currentTarget.getBoundingClientRect();
	return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
}
/** The scrolling session tree; unmounting drops the sessions subscription and expand-all state. */
function SessionTree({ useSessions, useSessionPendingInteraction, startSession, open, forkSession, workspaces, archivedSessionIds, workspaceReady, usePanelInfo, onRenameRequest, onDeleteRequest, onSessionRename, onSessionArchive, insertWorkspaceBefore, insertSessionBefore, orderBy, multirootMetadata, onManageRequest, groupExpansion, setGroupExpanded, sessionOrderByAccount, sessionUpdatedAtByAccount, syncSessionOrderAccount, setSessionOrder, home, t, revealSessionId, onSessionRevealed }) {
	const panelActive = usePanelInfo((info) => info.activePanelId !== null);
	const list = useSessions((s) => s);
	const pendingInteractions = useSessionPendingInteraction((s) => s);
	const current = panelActive ? void 0 : list.current;
	const revealGroup = revealSessionId === void 0 || !workspaceReady ? void 0 : owningGroupKey(workspaces, revealSessionId);
	const [expandedSessionGroups, setExpandedSessionGroups] = (0, react.useState)([]);
	const [drag, setDrag] = (0, react.useState)(null);
	const sessionDropCommitted = (0, react.useRef)(false);
	const [workspaceDrag, setWorkspaceDrag] = (0, react.useState)(null);
	const workspaceDropCommitted = (0, react.useRef)(false);
	const previousOrderBy = (0, react.useRef)(orderBy);
	useNativeDragAcceptance(drag !== null || workspaceDrag !== null);
	const currentGroup = current === void 0 || !workspaceReady ? void 0 : owningGroupKey(workspaces, current);
	(0, react.useEffect)(() => {
		if (current === void 0 || currentGroup === void 0 || Object.hasOwn(groupExpansion, currentGroup)) return;
		setGroupExpanded(currentGroup, true);
	}, [
		current,
		currentGroup,
		setGroupExpanded,
		groupExpansion
	]);
	const expandedGroups = (0, react.useMemo)(() => Object.entries(groupExpansion).filter(([, expanded]) => expanded).map(([key]) => key), [groupExpansion]);
	const ungroupedSessionIds = (0, react.useMemo)(() => {
		const accounted = new Set(workspaces.flatMap((workspace) => workspace.sessionIds));
		return list.ids.filter((id) => list.byId[id] !== void 0 && !accounted.has(id));
	}, [list, workspaces]);
	(0, react.useEffect)(() => {
		if (list.phase !== "ready") return;
		const switchedToUpdated = previousOrderBy.current !== "updated" && orderBy === "updated";
		previousOrderBy.current = orderBy;
		const accounts = [...workspaces.map((workspace) => ({
			key: workspace.workspaceId,
			sessionIds: workspace.sessionIds.filter((id) => list.byId[id] !== void 0)
		})), {
			key: "",
			sessionIds: ungroupedSessionIds
		}];
		for (const { key, sessionIds } of accounts) {
			const previousOrder = sessionOrderByAccount[key];
			const next = nextSessionOrderAccount({
				sessionIds,
				previousOrder,
				previousUpdatedAt: sessionUpdatedAtByAccount[key] ?? {},
				list,
				orderBy,
				sortByRecency: orderBy === "updated" && (previousOrder === void 0 || switchedToUpdated)
			});
			if (next.changed) syncSessionOrderAccount(key, next.order.map((id) => id), next.updatedAt);
		}
	}, [
		list,
		orderBy,
		sessionOrderByAccount,
		sessionUpdatedAtByAccount,
		syncSessionOrderAccount,
		ungroupedSessionIds,
		workspaces
	]);
	const orderedWorkspaces = (0, react.useMemo)(() => {
		return workspaces.map((workspace) => {
			const stored = sessionOrderByAccount[workspace.workspaceId];
			const sessionIds = reconciledSessionOrder(workspace.sessionIds, stored);
			return {
				...workspace,
				sessionIds
			};
		});
	}, [sessionOrderByAccount, workspaces]);
	const orderedUngroupedSessionIds = (0, react.useMemo)(() => reconciledSessionOrder(ungroupedSessionIds, sessionOrderByAccount[""]), [sessionOrderByAccount, ungroupedSessionIds]);
	const groups = (0, react.useMemo)(() => deriveGroups(list, orderedWorkspaces, archivedSessionIds, pendingInteractions, {
		expandedGroups,
		...sessionOrderByAccount[""] === void 0 ? {} : { ungroupedOrder: sessionOrderByAccount[""] }
	}), [
		list,
		orderedWorkspaces,
		archivedSessionIds,
		pendingInteractions,
		expandedGroups,
		sessionOrderByAccount
	]);
	(0, react.useEffect)(() => {
		if (revealGroup === void 0 || groupExpansion[revealGroup] === true) return;
		setGroupExpanded(revealGroup, true);
	}, [
		groupExpansion,
		revealGroup,
		setGroupExpanded
	]);
	(0, react.useEffect)(() => {
		if (revealSessionId === void 0 || revealGroup === void 0) return;
		const group = groups.find((candidate) => candidate.key === revealGroup);
		if (group === void 0 || !group.expanded || !group.sessions.some((row) => row.id === revealSessionId)) return;
		if (collapsedSessionRows(group.sessions).rows.some((row) => row.id === revealSessionId)) return;
		setExpandedSessionGroups((keys) => keys.includes(revealGroup) ? keys : [...keys, revealGroup]);
	}, [
		groups,
		revealGroup,
		revealSessionId
	]);
	const now = Date.now();
	const commitSessionDrag = (activeDrag, over) => {
		if (sessionDropCommitted.current) return;
		sessionDropCommitted.current = true;
		setDrag(null);
		const group = groups.find((candidate) => candidate.key === activeDrag.accountKey);
		if (group === void 0) return;
		const sessionsExpanded = expandedSessionGroups.includes(group.key);
		const renderedSessions = sessionsExpanded ? group.sessions : collapsedSessionRows(group.sessions).rows;
		const targetIndex = renderedSessions.findIndex((session) => session.id === over.id);
		if (targetIndex === -1) return;
		const sourceIndex = renderedSessions.findIndex((session) => session.id === activeDrag.sessionId);
		if (over.id === activeDrag.sessionId) return;
		const withoutSource = renderedSessions.filter((session) => session.id !== activeDrag.sessionId);
		const targetWithoutSourceIndex = withoutSource.findIndex((session) => session.id === over.id);
		if (targetWithoutSourceIndex === -1) return;
		const visibleInsertAt = over.half === "before" ? targetWithoutSourceIndex : targetWithoutSourceIndex + 1;
		if (sourceIndex !== -1 && visibleInsertAt === sourceIndex) return;
		const accountSessionIds = activeDrag.accountKey === "" ? orderedUngroupedSessionIds : orderedWorkspaces.find((workspace) => workspace.workspaceId === activeDrag.accountKey)?.sessionIds;
		if (accountSessionIds === void 0) return;
		const nextOrder = accountSessionIds.filter((id) => id !== activeDrag.sessionId);
		let anchor;
		if (sessionsExpanded) anchor = over.half === "before" ? over.id : renderedSessions[targetIndex + 1]?.id;
		else {
			const previousVisible = withoutSource[visibleInsertAt - 1]?.id;
			if (previousVisible === void 0) anchor = nextOrder[0];
			else {
				const previousIndex = nextOrder.indexOf(previousVisible);
				if (previousIndex === -1) return;
				anchor = nextOrder[previousIndex + 1];
			}
		}
		const insertAt = anchor === void 0 ? nextOrder.length : nextOrder.indexOf(anchor);
		nextOrder.splice(insertAt === -1 ? nextOrder.length : insertAt, 0, activeDrag.sessionId);
		if (!sessionsExpanded && sourceIndex !== -1) {
			const nodes = new Map(group.sessions.map((node) => [node.id, node]));
			if (!collapsedSessionRows(nextOrder.flatMap((id) => {
				const node = nodes.get(id);
				return node === void 0 ? [] : [node];
			})).rows.some((node) => node.id === activeDrag.sessionId)) return;
		}
		setSessionOrder(activeDrag.accountKey, nextOrder.map((id) => id));
		if (orderBy === "updated" || activeDrag.accountKey === "") return;
		insertSessionBefore(activeDrag.accountKey, activeDrag.sessionId, anchor).catch((reason) => {
			console.warn("session reorder rejected:", reason);
		});
	};
	const commitWorkspaceDrag = (activeDrag, over) => {
		if (workspaceDropCommitted.current) return;
		workspaceDropCommitted.current = true;
		setWorkspaceDrag(null);
		const rowIndex = workspaces.findIndex((workspace) => workspace.workspaceId === over.id);
		if (rowIndex === -1) return;
		const anchor = over.half === "before" ? over.id : workspaces[rowIndex + 1]?.workspaceId;
		if (anchor === activeDrag.workspaceId) return;
		const sourceIndex = workspaces.findIndex((workspace) => workspace.workspaceId === activeDrag.workspaceId);
		const anchorIndex = anchor === void 0 ? workspaces.length : workspaces.findIndex((workspace) => workspace.workspaceId === anchor);
		if (sourceIndex !== -1 && (anchorIndex === sourceIndex || anchorIndex === sourceIndex + 1)) return;
		insertWorkspaceBefore(activeDrag.workspaceId, anchor).catch((reason) => {
			console.warn("workspace reorder rejected:", reason);
		});
	};
	const workspaceDropAtListStart = groups[0]?.workspaceId !== void 0 && workspaceDrag?.over?.id === groups[0].workspaceId && workspaceDrag.over.half === "before";
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: clsx(WorkspaceBrowser_module_css_default.treeBody, WorkspaceBrowser_module_css_default.wide),
		children: [
			workspaceDropAtListStart && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: WorkspaceBrowser_module_css_default.listTopDropIndicator,
				"aria-hidden": "true"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: clsx(WorkspaceBrowser_module_css_default.list, workspaceDropAtListStart && WorkspaceBrowser_module_css_default.listTopDropActive),
				role: "tree",
				"aria-label": t("section.sessions"),
				children: [groups.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: WorkspaceBrowser_module_css_default.empty,
					children: t("empty.none")
				}), groups.map((group) => {
					const workspaceId = group.workspaceId;
					const collapsed = collapsedSessionRows(group.sessions);
					const sessionsExpanded = expandedSessionGroups.includes(group.key);
					const workspaceMarker = workspaceId !== void 0 && workspaceDrag?.over?.id === workspaceId ? workspaceDrag.over.half : null;
					const workspaceDragProps = workspaceId === void 0 ? void 0 : {
						start: () => {
							workspaceDropCommitted.current = false;
							setWorkspaceDrag({
								workspaceId,
								over: null
							});
						},
						end: () => {
							if (workspaceDrag?.over !== null && workspaceDrag?.over !== void 0) commitWorkspaceDrag(workspaceDrag, workspaceDrag.over);
							else setWorkspaceDrag(null);
							workspaceDropCommitted.current = false;
						}
					};
					const hoverWorkspace = workspaceId === void 0 ? void 0 : (half) => {
						setWorkspaceDrag((active) => active === null ? active : {
							...active,
							over: {
								id: workspaceId,
								half
							}
						});
					};
					const dropWorkspace = workspaceId === void 0 ? void 0 : (half) => {
						if (workspaceDrag === null) return;
						commitWorkspaceDrag(workspaceDrag, {
							id: workspaceId,
							half
						});
					};
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: clsx(WorkspaceBrowser_module_css_default.groupSection, workspaceMarker === "before" && WorkspaceBrowser_module_css_default.workspaceDropBefore, workspaceMarker === "after" && WorkspaceBrowser_module_css_default.workspaceDropAfter),
						onDragOver: workspaceDrag === null || hoverWorkspace === void 0 ? void 0 : (e) => {
							e.preventDefault();
							e.dataTransfer.dropEffect = "move";
							hoverWorkspace(workspaceGroupHalf(e));
						},
						onDrop: workspaceDrag === null || dropWorkspace === void 0 ? void 0 : (e) => {
							e.preventDefault();
							dropWorkspace(workspaceGroupHalf(e));
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProjectRowItem, {
								group,
								home,
								multiroot: group.workspaceId === void 0 ? void 0 : multirootMetadata.get(group.workspaceId),
								t,
								onToggle: () => {
									if (group.expanded) setExpandedSessionGroups((keys) => keys.filter((key) => key !== group.key));
									setGroupExpanded(group.key, !group.expanded);
								},
								onCreate: () => {
									if (group.workspaceId !== void 0) {
										setGroupExpanded(group.key, true);
										startSession(group.workspaceId);
									}
								},
								drag: workspaceDragProps,
								actions: group.workspaceId === void 0 ? void 0 : {
									rename: () => {
										/* v8 ignore next -- narrowing guard: the actions object exists only for real-workspace groups. */
										if (group.workspaceId !== void 0) onRenameRequest(group.workspaceId, group.label);
									},
									delete: () => {
										/* v8 ignore next -- narrowing guard: the actions object exists only for real-workspace groups. */
										if (group.workspaceId !== void 0) onDeleteRequest(group.workspaceId, group.label);
									},
									...multirootMetadata.has(group.workspaceId) ? { manage: () => {
										onManageRequest(group.workspaceId);
									} } : {}
								}
							}),
							(sessionsExpanded ? group.sessions : collapsed.rows).map((node) => {
								const sameGroupDrag = drag !== null && drag.accountKey === group.key;
								const dragProps = {
									start: () => {
										sessionDropCommitted.current = false;
										setDrag({
											accountKey: group.key,
											sessionId: node.id,
											over: null
										});
									},
									active: sameGroupDrag,
									marker: sameGroupDrag && drag.over?.id === node.id ? drag.over.half : null,
									hover: (half) => {
										/* v8 ignore next -- narrowing guard: Rows gates hover on `active`, which is false while the drag state is null. */
										setDrag((d) => d === null ? d : {
											...d,
											over: {
												id: node.id,
												half
											}
										});
									},
									drop: (half) => {
										/* v8 ignore next -- narrowing guard: Rows gates drop on `active`, which is false while the drag state is null. */
										if (drag === null) return;
										commitSessionDrag(drag, {
											id: node.id,
											half
										});
									},
									end: () => {
										if (drag?.over !== null && drag?.over !== void 0) commitSessionDrag(drag, drag.over);
										else setDrag(null);
										sessionDropCommitted.current = false;
									}
								};
								return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionNodeItem, {
									node,
									currentId: current,
									now,
									onOpen: open,
									onRename: onSessionRename,
									onFork: forkSession,
									onArchive: onSessionArchive,
									onReveal: node.id === revealSessionId && group.key === revealGroup ? () => {
										onSessionRevealed(node.id);
									} : void 0,
									drag: dragProps,
									t
								}, node.id);
							}),
							collapsed.hiddenCount > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: WorkspaceBrowser_module_css_default.sessionOverflowButton,
								"aria-expanded": sessionsExpanded,
								onClick: () => {
									setExpandedSessionGroups((keys) => toggled(keys, group.key));
								},
								children: sessionsExpanded ? t("sessions.collapse") : t("sessions.expand", { n: collapsed.hiddenCount })
							})
						]
					}, group.key);
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: WorkspaceBrowser_module_css_default.fade })
		]
	});
}
/** The flat "In one list" body: every session is one draggable top-level row. */
function FlatList({ useSessions, useSessionPendingInteraction, open, forkSession, onSessionRename, onSessionArchive, archivedSessionIds, usePanelInfo, orderBy, sessionOrderByAccount, sessionUpdatedAtByAccount, syncSessionOrderAccount, setSessionOrder, revealSessionId, onSessionRevealed, t }) {
	const panelActive = usePanelInfo((info) => info.activePanelId !== null);
	const list = useSessions((s) => s);
	const pendingInteractions = useSessionPendingInteraction((s) => s);
	const baseRows = (0, react.useMemo)(() => deriveFlat(list, archivedSessionIds, pendingInteractions), [
		list,
		archivedSessionIds,
		pendingInteractions
	]);
	const sessionIds = (0, react.useMemo)(() => baseRows.map((row) => row.id), [baseRows]);
	const previousOrderBy = (0, react.useRef)(orderBy);
	(0, react.useEffect)(() => {
		if (list.phase !== "ready") return;
		const previousOrder = sessionOrderByAccount[FLAT_SESSION_ORDER_KEY];
		const previousUpdatedAt = sessionUpdatedAtByAccount["__flat_session_order__"] ?? {};
		const switchedToUpdated = previousOrderBy.current !== "updated" && orderBy === "updated";
		previousOrderBy.current = orderBy;
		const next = nextSessionOrderAccount({
			sessionIds,
			previousOrder,
			previousUpdatedAt,
			list,
			orderBy,
			sortByRecency: orderBy === "updated" && (previousOrder === void 0 || switchedToUpdated)
		});
		if (next.changed) syncSessionOrderAccount(FLAT_SESSION_ORDER_KEY, next.order.map((id) => id), next.updatedAt);
	}, [
		list,
		orderBy,
		sessionOrderByAccount,
		sessionUpdatedAtByAccount,
		sessionIds,
		syncSessionOrderAccount
	]);
	const rows = (0, react.useMemo)(() => {
		const byId = new Map(baseRows.map((row) => [row.id, row]));
		return reconciledSessionOrder(sessionIds, sessionOrderByAccount[FLAT_SESSION_ORDER_KEY]).flatMap((id) => {
			const row = byId.get(id);
			return row === void 0 ? [] : [row];
		});
	}, [
		baseRows,
		sessionOrderByAccount,
		sessionIds
	]);
	const [drag, setDrag] = (0, react.useState)(null);
	const dropCommitted = (0, react.useRef)(false);
	useNativeDragAcceptance(drag !== null);
	const commitDrag = (activeDrag, over) => {
		if (dropCommitted.current) return;
		dropCommitted.current = true;
		setDrag(null);
		const targetIndex = rows.findIndex((row) => row.id === over.id);
		if (targetIndex === -1) return;
		const anchor = over.half === "before" ? over.id : rows[targetIndex + 1]?.id;
		if (anchor === activeDrag.sessionId) return;
		const sourceIndex = rows.findIndex((row) => row.id === activeDrag.sessionId);
		const anchorIndex = anchor === void 0 ? rows.length : rows.findIndex((row) => row.id === anchor);
		if (sourceIndex !== -1 && (anchorIndex === sourceIndex || anchorIndex === sourceIndex + 1)) return;
		const nextOrder = rows.map((row) => row.id).filter((id) => id !== activeDrag.sessionId);
		const insertAt = anchor === void 0 ? nextOrder.length : nextOrder.indexOf(anchor);
		nextOrder.splice(insertAt === -1 ? nextOrder.length : insertAt, 0, activeDrag.sessionId);
		setSessionOrder(FLAT_SESSION_ORDER_KEY, nextOrder.map((id) => id));
	};
	const now = Date.now();
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: clsx(WorkspaceBrowser_module_css_default.treeBody, WorkspaceBrowser_module_css_default.wide),
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: clsx(WorkspaceBrowser_module_css_default.list, WorkspaceBrowser_module_css_default.flatList),
			role: "tree",
			"aria-label": t("section.sessions"),
			children: [rows.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: WorkspaceBrowser_module_css_default.empty,
				children: t("empty.none")
			}), rows.map((node) => {
				const active = drag !== null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionNodeItem, {
					node,
					currentId: panelActive ? void 0 : list.current,
					now,
					onOpen: open,
					onRename: onSessionRename,
					onFork: forkSession,
					onArchive: onSessionArchive,
					onReveal: node.id === revealSessionId ? () => {
						onSessionRevealed(node.id);
					} : void 0,
					flat: true,
					drag: {
						start: () => {
							dropCommitted.current = false;
							setDrag({
								accountKey: FLAT_SESSION_ORDER_KEY,
								sessionId: node.id,
								over: null
							});
						},
						active,
						marker: active && drag.over?.id === node.id ? drag.over.half : null,
						hover: (half) => {
							setDrag((current) => current === null ? current : {
								...current,
								over: {
									id: node.id,
									half
								}
							});
						},
						drop: (half) => {
							if (drag !== null) commitDrag(drag, {
								id: node.id,
								half
							});
						},
						end: () => {
							if (drag?.over !== null && drag?.over !== void 0) commitDrag(drag, drag.over);
							else setDrag(null);
							dropCommitted.current = false;
						}
					},
					t
				}, node.id);
			})]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: WorkspaceBrowser_module_css_default.fade })]
	});
}
/** Flat search body: local metadata matches plus the current Host result page. */
function SearchResults({ useSessions, useSessionPendingInteraction, open, workspaces, archivedSessionIds, query, remote, resultLimit, usePanelInfo, t }) {
	const panelActive = usePanelInfo((info) => info.activePanelId !== null);
	const list = useSessions((s) => s);
	const pendingInteractions = useSessionPendingInteraction((s) => s);
	const currentRemote = remote.query === query ? remote : {
		query,
		status: "loading",
		items: [],
		hasMore: false
	};
	const results = (0, react.useMemo)(() => deriveSearchResults(list, workspaces, query, archivedSessionIds, pendingInteractions, currentRemote, resultLimit), [
		list,
		workspaces,
		query,
		archivedSessionIds,
		pendingInteractions,
		currentRemote,
		resultLimit
	]);
	const pending = currentRemote.status === "loading";
	const failed = currentRemote.status === "error";
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: clsx(WorkspaceBrowser_module_css_default.treeBody, WorkspaceBrowser_module_css_default.wide),
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: WorkspaceBrowser_module_css_default.list,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: WorkspaceBrowser_module_css_default.searchTree,
					role: "tree",
					"aria-label": t("search.results.aria"),
					children: results.items.map((result) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SearchResultItem, {
						result,
						currentId: panelActive ? void 0 : list.current,
						onOpen: open,
						t
					}, result.id))
				}),
				pending && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: WorkspaceBrowser_module_css_default.searchStatus,
					role: "status",
					children: t("search.pending")
				}),
				failed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: WorkspaceBrowser_module_css_default.searchWarning,
					role: "status",
					children: t("search.unavailable")
				}),
				!pending && results.items.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: WorkspaceBrowser_module_css_default.empty,
					children: t("search.noMatches")
				}),
				results.hasMore && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: WorkspaceBrowser_module_css_default.searchStatus,
					children: t("search.hasMore", { n: resultLimit })
				})
			]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: WorkspaceBrowser_module_css_default.fade })]
	});
}
/**
* Render the browsing region.
* @param props - composed slot props (shell owner share + store + injected actions).
* @returns the region element tree.
*/
function WorkspaceBrowser({ wide, usePanelInfo, expandSidebar, useSessions, useSessionPendingInteraction, useWorkspaces, useStore, actions, startSession, open, renameSession, forkSession, renameWorkspace, deleteWorkspace, insertWorkspaceBefore, archiveSession, insertSessionBefore, createWorkspace, searchSessions, searchResultLimit, useDirectoryFlow, useHostInfo, renderSlot, t }) {
	const home = useHostInfo((info) => info.home);
	const workspaces = useWorkspaces((state) => state.items);
	const workspacePhase = useWorkspaces((state) => state.phase);
	const workspaceStreamState = useWorkspaces((state) => state.state);
	const archivedSessionIds = useWorkspaces((state) => state.archivedSessionIds);
	const directoryFlowAvailable = useDirectoryFlow((occupied) => occupied);
	const multirootQuery = useMultirootRecords();
	const multirootJoin = (0, react.useMemo)(() => joinMultiroot(workspaces, multirootQuery.records), [multirootQuery.records, workspaces]);
	const groupBy = useStore((s) => s.groupBy);
	const orderBy = useStore((s) => s.orderBy);
	const groupExpansion = useStore((s) => s.groupExpansion);
	const sessionOrderByAccount = useStore((s) => s.sessionOrderByAccount);
	const sessionUpdatedAtByAccount = useStore((s) => s.sessionUpdatedAtByAccount);
	const currentBlankSessionId = useSessions((state) => {
		const current = state.current;
		return current !== void 0 && state.byId[current]?.blank === true ? current : void 0;
	});
	const currentBlankAccount = currentBlankSessionId === void 0 || workspacePhase !== "ready" ? void 0 : owningGroupKey(workspaces, currentBlankSessionId);
	const promotedBlank = (0, react.useRef)(void 0);
	(0, react.useEffect)(() => {
		if (currentBlankSessionId === void 0 || currentBlankAccount === void 0) {
			promotedBlank.current = void 0;
			return;
		}
		const promoted = promotedBlank.current;
		if (promoted !== void 0 && promoted.sessionId === currentBlankSessionId && promoted.accountKey === currentBlankAccount) return;
		promotedBlank.current = {
			sessionId: currentBlankSessionId,
			accountKey: currentBlankAccount
		};
		for (const accountKey of /* @__PURE__ */ new Set([currentBlankAccount, FLAT_SESSION_ORDER_KEY])) {
			const previous = sessionOrderByAccount[accountKey] ?? [];
			actions.setSessionOrder(accountKey, [currentBlankSessionId, ...previous.filter((id) => id !== currentBlankSessionId)]);
		}
	}, [
		actions.setSessionOrder,
		currentBlankAccount,
		currentBlankSessionId,
		sessionOrderByAccount
	]);
	(0, react.useEffect)(() => {
		if (workspacePhase !== "ready") return;
		actions.retainAccountKeys([
			"",
			FLAT_SESSION_ORDER_KEY,
			...workspaces.map((workspace) => workspace.workspaceId)
		]);
	}, [
		actions.retainAccountKeys,
		workspacePhase,
		workspaces
	]);
	const [query, setQuery] = (0, react.useState)("");
	const [searchExpanded, setSearchExpanded] = (0, react.useState)(false);
	const [revealSessionId, setRevealSessionId] = (0, react.useState)(void 0);
	const normalizedQuery = sanitizeSearchQuery(query).trim();
	const [remoteSearch, setRemoteSearch] = (0, react.useState)({
		query: "",
		status: "idle",
		items: [],
		hasMore: false
	});
	const searchRoot = (0, react.useRef)(null);
	const searchInput = (0, react.useRef)(null);
	const [wsPickerOpen, setWsPickerOpen] = (0, react.useState)(false);
	const wsPlusRef = (0, react.useRef)(null);
	const composingRef = (0, react.useRef)(false);
	const [multirootDialogRecord, setMultirootDialogRecord] = (0, react.useState)(void 0);
	const openSearchResult = (sessionId) => {
		setRevealSessionId(sessionId);
		setQuery("");
		setSearchExpanded(false);
		open(sessionId);
	};
	const acknowledgeSessionReveal = (sessionId) => {
		setRevealSessionId((current) => current === sessionId ? void 0 : current);
	};
	(0, react.useEffect)(() => {
		if (normalizedQuery !== "") setRevealSessionId(void 0);
	}, [normalizedQuery]);
	const [searchOnExpand, setSearchOnExpand] = (0, react.useState)(false);
	(0, react.useEffect)(() => {
		if (wide && searchOnExpand) {
			const timer = window.setTimeout(() => {
				searchInput.current?.focus({ preventScroll: true });
				setSearchOnExpand(false);
			}, EXPAND_SLIDE_MS);
			return () => {
				window.clearTimeout(timer);
			};
		}
	}, [wide, searchOnExpand]);
	(0, react.useEffect)(() => {
		if (!wide || !searchExpanded || searchOnExpand) return;
		searchInput.current?.focus({ preventScroll: true });
	}, [
		wide,
		searchExpanded,
		searchOnExpand
	]);
	(0, react.useEffect)(() => {
		if (!wide || !searchExpanded || searchOnExpand) return;
		const onClick = (event) => {
			if (!(event.target instanceof Node) || searchRoot.current?.contains(event.target) === true) return;
			searchInput.current?.blur();
			if (normalizedQuery !== "") return;
			setSearchExpanded(false);
		};
		document.addEventListener("click", onClick);
		return () => {
			document.removeEventListener("click", onClick);
		};
	}, [
		normalizedQuery,
		wide,
		searchExpanded,
		searchOnExpand
	]);
	(0, react.useEffect)(() => {
		if (normalizedQuery === "") {
			setRemoteSearch({
				query: "",
				status: "idle",
				items: [],
				hasMore: false
			});
			return;
		}
		const controller = new AbortController();
		setRemoteSearch({
			query: normalizedQuery,
			status: "loading",
			items: [],
			hasMore: false
		});
		const timer = window.setTimeout(() => {
			searchSessions(normalizedQuery, controller.signal).then((result) => {
				if (controller.signal.aborted) return;
				setRemoteSearch({
					query: normalizedQuery,
					status: "ready",
					items: result.items,
					hasMore: result.hasMore
				});
			}).catch(() => {
				if (controller.signal.aborted) return;
				setRemoteSearch({
					query: normalizedQuery,
					status: "error",
					items: [],
					hasMore: false
				});
			});
		}, SEARCH_DEBOUNCE_MS);
		return () => {
			window.clearTimeout(timer);
			controller.abort();
		};
	}, [normalizedQuery, searchSessions]);
	const [renameTarget, setRenameTarget] = (0, react.useState)(null);
	const [renameDraft, setRenameDraft] = (0, react.useState)("");
	const [renaming, setRenaming] = (0, react.useState)(false);
	const [renameError, setRenameError] = (0, react.useState)(null);
	const renameTrimmed = renameDraft.trim();
	const renameDuplicate = renameTarget !== null && renameTrimmed !== "" && renameTrimmed !== renameTarget.currentTitle && workspaces.some((w) => w.title === renameTrimmed);
	const renameBlocked = renaming || renameTrimmed === "" || renameTarget === null || renameTrimmed === renameTarget.currentTitle || renameDuplicate;
	const closeRename = () => {
		if (renaming) return;
		setRenameTarget(null);
		setRenameError(null);
	};
	const confirmRename = () => {
		if (renameBlocked) return;
		setRenaming(true);
		setRenameError(null);
		renameWorkspace(renameTarget.workspaceId, renameTrimmed).then(() => {
			setRenaming(false);
			setRenameTarget(null);
		}).catch((reason) => {
			setRenaming(false);
			setRenameError(reason instanceof Error ? reason.message : String(reason));
		});
	};
	const [sessionRenameTarget, setSessionRenameTarget] = (0, react.useState)(null);
	const [sessionRenameDraft, setSessionRenameDraft] = (0, react.useState)("");
	const [sessionRenaming, setSessionRenaming] = (0, react.useState)(false);
	const [sessionRenameError, setSessionRenameError] = (0, react.useState)(null);
	const sessionRenameTrimmed = sessionRenameDraft.trim();
	const sessionRenameBlocked = sessionRenaming || sessionRenameTrimmed === "" || sessionRenameTarget === null;
	const closeSessionRename = () => {
		if (sessionRenaming) return;
		setSessionRenameTarget(null);
		setSessionRenameError(null);
	};
	const confirmSessionRename = () => {
		if (sessionRenameBlocked) return;
		setSessionRenaming(true);
		setSessionRenameError(null);
		renameSession(sessionRenameTarget.sessionId, sessionRenameTrimmed).then(() => {
			setSessionRenaming(false);
			setSessionRenameTarget(null);
		}).catch((reason) => {
			setSessionRenaming(false);
			setSessionRenameError(reason instanceof Error ? reason.message : String(reason));
		});
	};
	const onSessionRename = (sessionId, currentTitle) => {
		setSessionRenameTarget({
			sessionId,
			currentTitle
		});
		setSessionRenameDraft(currentTitle);
		setSessionRenameError(null);
	};
	const onSessionArchive = (sessionId) => {
		archiveSession(sessionId).catch((reason) => {
			console.warn("session archive rejected:", reason);
		});
	};
	const [deleteTarget, setDeleteTarget] = (0, react.useState)(null);
	const [deleting, setDeleting] = (0, react.useState)(false);
	const [deleteCommittedId, setDeleteCommittedId] = (0, react.useState)(null);
	const [deleteError, setDeleteError] = (0, react.useState)(null);
	(0, react.useEffect)(() => {
		if (deleteCommittedId === null || workspaces.some((workspace) => workspace.workspaceId === deleteCommittedId)) return;
		setDeleting(false);
		setDeleteCommittedId(null);
		setDeleteTarget(null);
	}, [deleteCommittedId, workspaces]);
	const closeDelete = () => {
		if (deleting) return;
		setDeleteTarget(null);
		setDeleteError(null);
	};
	const confirmDelete = () => {
		/* v8 ignore next -- the Modal is absent without a target and its button is disabled while deleting. */
		if (deleting || deleteTarget === null) return;
		setDeleting(true);
		setDeleteCommittedId(null);
		setDeleteError(null);
		deleteWorkspace(deleteTarget.workspaceId).then(() => {
			setDeleteCommittedId(deleteTarget.workspaceId);
		}).catch((reason) => {
			setDeleting(false);
			setDeleteError(reason instanceof Error ? reason.message : String(reason));
		});
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: clsx(WorkspaceBrowser_module_css_default.root, !wide && WorkspaceBrowser_module_css_default.rail),
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: WorkspaceBrowser_module_css_default.sectionHeader,
				children: [
					wide && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: clsx(WorkspaceBrowser_module_css_default.sectionLabel, WorkspaceBrowser_module_css_default.wide, searchExpanded && WorkspaceBrowser_module_css_default.sectionLabelHidden),
						children: groupBy === "flat" ? t("section.sessions") : t("section.workspaces")
					}),
					wide && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: clsx(WorkspaceBrowser_module_css_default.searchSlot, searchExpanded && WorkspaceBrowser_module_css_default.searchSlotExpanded),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							ref: searchRoot,
							className: clsx(WorkspaceBrowser_module_css_default.search, searchExpanded && WorkspaceBrowser_module_css_default.searchExpanded),
							onClick: () => {
								setWsPickerOpen(false);
								setSearchExpanded(true);
								searchInput.current?.focus();
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
									label: t("search"),
									side: "bottom",
									delayMs: 500,
									disabled: searchExpanded,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: WorkspaceBrowser_module_css_default.searchButton,
										"aria-label": t("search.sessions.aria"),
										"aria-expanded": searchExpanded,
										onClick: () => {
											setWsPickerOpen(false);
											setSearchExpanded(true);
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutline16, { size: searchExpanded ? 11 : 14 })
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									ref: searchInput,
									className: WorkspaceBrowser_module_css_default.searchInput,
									type: "text",
									placeholder: t("search.placeholder"),
									maxLength: SEARCH_QUERY_MAX_CODE_UNITS,
									value: query,
									tabIndex: searchExpanded ? 0 : -1,
									onChange: (e) => {
										setQuery(sanitizeSearchQuery(e.target.value));
									},
									onKeyDown: (e) => {
										if (e.key !== "Escape") return;
										setQuery("");
										setSearchExpanded(false);
									}
								}),
								searchExpanded && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: WorkspaceBrowser_module_css_default.clearButton,
									"aria-label": t("search.clear"),
									onClick: (e) => {
										e.stopPropagation();
										setQuery("");
										setSearchExpanded(false);
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseFill14, {})
								})
							]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: clsx(WorkspaceBrowser_module_css_default.headerActions, wide && searchExpanded && WorkspaceBrowser_module_css_default.headerActionsHidden),
						children: [
							wide && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ViewOptionsMenu, {
								groupBy,
								orderBy,
								onGroupPick: (mode) => {
									actions.setGroupBy(mode);
								},
								onOrderPick: (mode) => {
									actions.setOrderBy(mode);
								},
								t
							}),
							directoryFlowAvailable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
								label: t("workspace.add"),
								side: "bottom",
								delayMs: 500,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									ref: wsPlusRef,
									type: "button",
									className: WorkspaceBrowser_module_css_default.iconButton,
									"aria-label": t("workspace.add"),
									onClick: () => {
										setWsPickerOpen((v) => !v);
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconProjectAddOutline16, { size: wide ? 16 : 18 })
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
								label: t("multiroot.add"),
								side: "bottom",
								delayMs: 500,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: WorkspaceBrowser_module_css_default.iconButton,
									"aria-label": t("multiroot.add"),
									disabled: !directoryFlowAvailable || multirootQuery.phase === "error",
									onClick: () => {
										setWsPickerOpen(false);
										setMultirootDialogRecord(null);
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, { size: wide ? 16 : 18 })
								})
							})
						]
					}),
					multirootDialogRecord === void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspacePickFlow, {
						t,
						open: wsPickerOpen,
						anchorRef: wsPlusRef,
						useWorkspaces,
						createWorkspace,
						useDirectoryFlow,
						renderDirectoryFlow: (owner) => renderSlot("sidebar.workspaces.directoryFlow", owner),
						addOnly: true,
						side: "right",
						onPick: (workspaceId) => {
							setWsPickerOpen(false);
							startSession(workspaceId);
						},
						onClose: () => {
							setWsPickerOpen(false);
						}
					})
				]
			}),
			!wide && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: WorkspaceBrowser_module_css_default.search,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
					label: t("search"),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: WorkspaceBrowser_module_css_default.searchButton,
						"aria-label": t("search.sessions.aria"),
						onClick: () => {
							setSearchExpanded(true);
							setSearchOnExpand(true);
							expandSidebar();
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutline16, { size: 18 })
					})
				})
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: WorkspaceBrowser_module_css_default.listArea,
				children: [wide && multirootQuery.error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: WorkspaceBrowser_module_css_default.multirootError,
					children: t("multiroot.unavailable")
				}), wide && (normalizedQuery !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SearchResults, {
					usePanelInfo,
					useSessions,
					useSessionPendingInteraction,
					open: openSearchResult,
					workspaces,
					archivedSessionIds,
					query: normalizedQuery,
					remote: remoteSearch,
					resultLimit: searchResultLimit,
					t
				}) : groupBy === "flat" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FlatList, {
					usePanelInfo,
					useSessions,
					useSessionPendingInteraction,
					open,
					forkSession,
					onSessionRename,
					onSessionArchive,
					archivedSessionIds,
					orderBy,
					sessionOrderByAccount,
					sessionUpdatedAtByAccount,
					syncSessionOrderAccount: actions.syncSessionOrderAccount,
					setSessionOrder: actions.setSessionOrder,
					revealSessionId,
					onSessionRevealed: acknowledgeSessionReveal,
					t
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionTree, {
					usePanelInfo,
					useSessions,
					useSessionPendingInteraction,
					onSessionRename,
					onSessionArchive,
					forkSession,
					workspaces,
					workspaceReady: workspacePhase === "ready" && workspaceStreamState !== "loading",
					groupExpansion,
					setGroupExpanded: actions.setGroupExpanded,
					sessionOrderByAccount,
					sessionUpdatedAtByAccount,
					syncSessionOrderAccount: actions.syncSessionOrderAccount,
					setSessionOrder: actions.setSessionOrder,
					archivedSessionIds,
					startSession,
					open,
					insertWorkspaceBefore,
					insertSessionBefore,
					orderBy,
					multirootMetadata: multirootJoin.metadataByWorkspaceId,
					onManageRequest: (workspaceId) => {
						const metadata = multirootJoin.metadataByWorkspaceId.get(workspaceId);
						if (metadata !== void 0) setMultirootDialogRecord(metadata.logical);
					},
					revealSessionId,
					onSessionRevealed: acknowledgeSessionReveal,
					home,
					t,
					onRenameRequest: (workspaceId, currentTitle) => {
						setRenameTarget({
							workspaceId,
							currentTitle
						});
						setRenameDraft(currentTitle);
						setRenameError(null);
					},
					onDeleteRequest: (workspaceId, title) => {
						setDeleteTarget({
							workspaceId,
							title
						});
						setDeleteError(null);
					}
				}))]
			}),
			multirootDialogRecord !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MultirootDialog, {
				open: true,
				record: multirootDialogRecord,
				onClose: () => {
					setMultirootDialogRecord(void 0);
				},
				refresh: multirootQuery.refresh,
				renderDirectoryFlow: (owner) => renderSlot("sidebar.workspaces.directoryFlow", owner),
				t
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: renameTarget !== null,
				onClose: closeRename,
				closeLabel: t("close"),
				title: t("rename.workspace.title"),
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					disabled: renaming,
					onClick: closeRename,
					children: t("cancel")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					disabled: renameBlocked,
					onClick: confirmRename,
					children: t("rename")
				})] }),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: WorkspaceBrowser_module_css_default.renameInput,
						value: renameDraft,
						"aria-label": t("field.workspaceName"),
						autoFocus: true,
						disabled: renaming,
						onFocus: (e) => {
							e.target.select();
						},
						onChange: (e) => {
							setRenameDraft(e.target.value);
							setRenameError(null);
						},
						onCompositionStart: () => {
							composingRef.current = true;
						},
						onCompositionEnd: () => {
							composingRef.current = false;
						},
						onKeyDown: (e) => {
							if (e.key === "Enter" && !composingRef.current) {
								e.preventDefault();
								confirmRename();
							}
						}
					}),
					renameDuplicate && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: WorkspaceBrowser_module_css_default.renameError,
						role: "alert",
						children: t("conflict.named", { name: renameTrimmed })
					}),
					renameError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: WorkspaceBrowser_module_css_default.renameError,
						role: "alert",
						children: renameError
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: sessionRenameTarget !== null,
				onClose: closeSessionRename,
				closeLabel: t("close"),
				title: t("rename.session.title"),
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					disabled: sessionRenaming,
					onClick: closeSessionRename,
					children: t("cancel")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					disabled: sessionRenameBlocked,
					onClick: confirmSessionRename,
					children: t("rename")
				})] }),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					className: WorkspaceBrowser_module_css_default.renameInput,
					value: sessionRenameDraft,
					"aria-label": t("field.sessionName"),
					autoFocus: true,
					disabled: sessionRenaming,
					onFocus: (e) => {
						e.target.select();
					},
					onChange: (e) => {
						setSessionRenameDraft(e.target.value);
						setSessionRenameError(null);
					},
					onCompositionStart: () => {
						composingRef.current = true;
					},
					onCompositionEnd: () => {
						composingRef.current = false;
					},
					onKeyDown: (e) => {
						if (e.key === "Enter" && !composingRef.current) {
							e.preventDefault();
							confirmSessionRename();
						}
					}
				}), sessionRenameError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: WorkspaceBrowser_module_css_default.renameError,
					role: "alert",
					children: sessionRenameError
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: deleteTarget !== null,
				onClose: closeDelete,
				closeLabel: t("close"),
				title: t("delete.workspace"),
				...deleteTarget === null ? {} : { description: t("delete.desc", { name: deleteTarget.title }) },
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					disabled: deleting,
					onClick: closeDelete,
					children: t("cancel")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					className: WorkspaceBrowser_module_css_default.deleteAction,
					disabled: deleting,
					onClick: confirmDelete,
					children: t("delete.workspace")
				})] }),
				children: [deleting && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: WorkspaceBrowser_module_css_default.deleteStatus,
					role: "status",
					children: t("delete.pending")
				}), deleteError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: WorkspaceBrowser_module_css_default.renameError,
					role: "alert",
					children: deleteError
				})]
			})
		]
	});
}

//#endregion
//#region src/client/locales.ts
/**
* `workspace` namespace dictionaries: the browsing region (section header,
* search, tree rows, dialogs) and the pick/add flow. Runtime failure
* messages (wire error strings) pass through untranslated by policy.
*/
/** Simplified Chinese dictionary (the key-set source of truth). */
const zh = {
	"group.ungrouped": "未分组",
	"session.new": "新会话",
	"section.workspaces": "工作区",
	"section.sessions": "会话",
	"viewOptions.label": "视图选项",
	"groupBy.label": "分组方式",
	"groupBy.workspace": "按工作区",
	"groupBy.flat": "单列表",
	"orderBy.label": "排序方式",
	"orderBy.manual": "手动排序",
	"orderBy.updated": "最近更新",
	"sessions.expand": "展开其余 {n} 个会话",
	"sessions.collapse": "收起",
	"empty.none": "暂无会话",
	"empty.noMatches": "无匹配结果",
	"workspace.add": "添加工作区",
	"search.sessions.aria": "搜索会话",
	"search.placeholder": "搜索会话…",
	"search.clear": "清除搜索",
	"search.results.aria": "搜索结果",
	"search.pending": "正在搜索会话历史…",
	"search.unavailable": "内容搜索暂不可用，仅显示名称匹配。",
	"search.noMatches": "无匹配会话",
	"search.hasMore": "仅显示前 {n} 条结果，请缩小搜索范围。",
	"menu.addWorkspace": "添加工作区…",
	"multiroot.manage": "管理多根工作区",
	"multiroot.manage.title": "管理多根工作区",
	"multiroot.add": "添加多根工作区",
	"multiroot.create": "创建",
	"multiroot.delete": "删除多根工作区",
	"multiroot.addFolder": "添加文件夹…",
	"multiroot.remove": "移除",
	"multiroot.primary": "主根",
	"multiroot.currentPrimary": "当前主根",
	"multiroot.makePrimary": "设“{name}”为主根",
	"multiroot.alias": "根 {n} 的别名",
	"multiroot.roots": "根目录",
	"multiroot.rootCount": "{count} 个",
	"multiroot.directoryName": "目录名称",
	"multiroot.directoryPath": "目录路径",
	"multiroot.empty": "至少添加一个文件夹。",
	"multiroot.unavailable": "多根工作区暂不可用",
	"multiroot.meta": "{count} 个根 · 主根 {primary}",
	"picker.loading": "正在加载工作区…",
	"conflict.named": "已存在名为“{name}”的工作区。",
	"folderError.title": "无法打开文件夹",
	"folderError.retry": "重新选择",
	"rename": "重命名",
	"rename.workspace.title": "重命名工作区",
	"rename.session.title": "重命名会话",
	"field.workspaceName": "工作区名称",
	"field.sessionName": "会话名称",
	"delete.workspace": "删除工作区",
	"delete.desc": "将把“{name}”从工作区列表中移除。文件夹与会话记录会保留，其会话将显示在“未分组”下。",
	"delete.pending": "正在删除工作区…",
	"menu.fork": "分叉会话",
	"menu.archiveSession": "归档会话",
	"sessions.count.one": "{n} 个会话",
	"sessions.count.other": "{n} 个会话",
	"actions.workspace.aria": "工作区“{name}”的操作",
	"actions.session.aria": "会话“{name}”的操作",
	"actions.newSession.aria": "在“{name}”中新建会话",
	"status.running": "进行中",
	"status.subagentsRunning.one": "{n} 个子代理运行中",
	"status.subagentsRunning.other": "{n} 个子代理运行中",
	"status.idle": "空闲",
	"status.waitingApproval": "等待审批",
	"status.planReview": "计划待审",
	"status.waitingAnswer": "等待回答",
	"status.completed": "已完成",
	"schedule.active": "有活动定时任务",
	"hover.created": "创建于 {time}",
	"hover.copied": "已复制",
	"date.ymd": "{y}年{m}月{d}日",
	"time.now": "刚刚",
	"time.minutes": "{n}分钟",
	"time.hours": "{n}小时",
	"time.days": "{n}天",
	"time.months": "{n}个月",
	"time.years": "{n}年",
	"time.ago": "{t}前"
};
/** English dictionary, checked complete against the zh key set. */
const en = {
	"group.ungrouped": "Ungrouped",
	"session.new": "New Session",
	"section.workspaces": "Workspaces",
	"section.sessions": "Sessions",
	"viewOptions.label": "View options",
	"groupBy.label": "Group by",
	"groupBy.workspace": "WorkSpace",
	"groupBy.flat": "In one list",
	"orderBy.label": "Order by",
	"orderBy.manual": "Manual",
	"orderBy.updated": "Last updated",
	"sessions.expand": "Show {n} more sessions",
	"sessions.collapse": "Show less",
	"empty.none": "No sessions yet",
	"empty.noMatches": "No matches",
	"workspace.add": "Add workspace",
	"search.sessions.aria": "Search sessions",
	"search.placeholder": "Search sessions...",
	"search.clear": "Clear search",
	"search.results.aria": "Search results",
	"search.pending": "Searching session history…",
	"search.unavailable": "Content search is temporarily unavailable. Showing name matches.",
	"search.noMatches": "No matching sessions",
	"search.hasMore": "Showing the first {n} results. Narrow your search.",
	"menu.addWorkspace": "Add workspace…",
	"multiroot.manage": "Manage multiroot workspace",
	"multiroot.manage.title": "Manage multiroot workspace",
	"multiroot.add": "Add multiroot workspace",
	"multiroot.create": "Create",
	"multiroot.delete": "Delete multiroot workspace",
	"multiroot.addFolder": "Add folder…",
	"multiroot.remove": "Remove",
	"multiroot.primary": "Primary",
	"multiroot.currentPrimary": "Current primary",
	"multiroot.makePrimary": "Make {name} primary",
	"multiroot.alias": "Alias for root {n}",
	"multiroot.roots": "Root directories",
	"multiroot.rootCount": "{count}",
	"multiroot.directoryName": "Directory name",
	"multiroot.directoryPath": "Directory path",
	"multiroot.empty": "Add at least one folder.",
	"multiroot.unavailable": "Multiroot workspaces are unavailable",
	"multiroot.meta": "{count} roots · primary {primary}",
	"picker.loading": "Loading workspaces…",
	"conflict.named": "A workspace named “{name}” already exists.",
	"folderError.title": "Couldn’t open folder",
	"folderError.retry": "Choose again",
	"rename": "Rename",
	"rename.workspace.title": "Rename workspace",
	"rename.session.title": "Rename session",
	"field.workspaceName": "Workspace name",
	"field.sessionName": "Session name",
	"delete.workspace": "Delete workspace",
	"delete.desc": "This removes “{name}” from the workspace list. The folder and session logs will be kept. Its sessions will appear under Ungrouped.",
	"delete.pending": "Deleting workspace…",
	"menu.fork": "Fork session",
	"menu.archiveSession": "Archive session",
	"sessions.count.one": "{n} session",
	"sessions.count.other": "{n} sessions",
	"actions.workspace.aria": "Workspace actions for {name}",
	"actions.session.aria": "Session actions for {name}",
	"actions.newSession.aria": "New session in {name}",
	"status.running": "Running",
	"status.subagentsRunning.one": "{n} subagent running",
	"status.subagentsRunning.other": "{n} subagents running",
	"status.idle": "Idle",
	"status.waitingApproval": "Waiting for approval",
	"status.planReview": "Plan awaiting review",
	"status.waitingAnswer": "Waiting for answer",
	"status.completed": "Completed",
	"schedule.active": "Has active scheduled task",
	"hover.created": "Created {time}",
	"hover.copied": "Copied",
	"date.ymd": "{y}-{m}-{d}",
	"time.now": "now",
	"time.minutes": "{n}min",
	"time.hours": "{n}h",
	"time.days": "{n}d",
	"time.months": "{n}mo",
	"time.years": "{n}y",
	"time.ago": "{t} ago"
};

//#endregion
//#region src/client/index.ts
/** Dictionary namespace owned by this plugin. */
const NS = "workspace";
/**
* Required services (cordis fiber inject). The target slots are declared by
* the ui-sidebar / ui-conversation applies, whose activation order relative
* to this one is NOT constrained: dsh.client.inject edges are informational
* (loading/prefetch metadata, never apply sequencing) and neither owner
* provides a waitable service. apply therefore depends on each slot
* declaration through `slots.inject()` instead of assuming order.
*/
const inject = [
	"slots",
	"sessions",
	"workspaces",
	"locale",
	"remote",
	"remote.directoryPicker",
	"layout"
];
/**
* Register the browser and picker once their slot declarations are on the
* ledger. Inject factories return plain callbacks; data reads use the
* framework's global hooks.
* @param ctx - client root context.
*/
function apply(ctx) {
	const sessions = ctx.get("sessions");
	const workspaces = ctx.get("workspaces");
	const uiWorkspace = new UiWorkspaceService(ctx, ctx.remote.directoryPicker, workspaces, sessions);
	ctx.slots.provideRoot({ hooks: { workspaces: workspaces.list } });
	ctx.effect(() => ctx.locale.register(NS, {
		zh,
		en
	}), "ui-workspace: dictionaries");
	const searchSessions = async (query, signal) => {
		const result = await sessions.search(query, signal);
		if (!result.ok) throw new Error(result.error.message);
		return result.value;
	};
	const flowSource = (hole) => ({
		getSnapshot: () => ctx.slots.entries(hole).length > 0,
		subscribe: (listener) => ctx.slots.subscribe(hole, listener)
	});
	const browserFlowSource = flowSource("sidebar.workspaces.directoryFlow");
	const hostInfo = {
		getSnapshot: () => ctx.remote.$host,
		subscribe: (listener) => ctx.on("connection/reset", listener)
	};
	const pickerFlowSource = flowSource("conversation.hero.workspace.directoryFlow");
	const openSession = (sessionId) => {
		uiWorkspace.openSession(sessionId);
	};
	const browserInjected = () => ({
		startSession: (workspaceId) => {
			uiWorkspace.startSession(workspaceId);
		},
		open: openSession,
		searchSessions,
		searchResultLimit: sessions.searchResultLimit,
		renameSession: async (sessionId, title) => {
			const session = sessions.binding(sessionId)?.session;
			if (session === void 0) throw new Error(`unknown session "${sessionId}"`);
			const result = await session.rename(title);
			if (!result.ok) throw new Error(result.error.message);
		},
		forkSession: (sessionId) => {
			uiWorkspace.forkSession(sessionId).catch(() => {});
		},
		renameWorkspace: async (workspaceId, title) => {
			await workspaces.rename(workspaceId, title);
		},
		deleteWorkspace: async (workspaceId) => {
			await workspaces.delete(workspaceId);
		},
		insertWorkspaceBefore: async (workspaceId, beforeWorkspaceId) => {
			await workspaces.insertBefore(workspaceId, beforeWorkspaceId);
		},
		archiveSession: async (sessionId) => {
			await uiWorkspace.archiveSession(sessionId);
		},
		insertSessionBefore: async (workspaceId, sessionId, beforeSessionId) => {
			await workspaces.insertSessionBefore(workspaceId, sessionId, beforeSessionId);
		},
		createWorkspace: (input) => workspaces.create(input),
		hooks: {
			directoryFlow: browserFlowSource,
			hostInfo
		}
	});
	const pickerInjected = () => ({
		createWorkspace: (input) => workspaces.create(input),
		hooks: { directoryFlow: pickerFlowSource }
	});
	ctx.slots.inject("sidebar.workspaces", () => ctx.slots.register({
		name: "sidebar.workspaces",
		children: { "sidebar.workspaces.directoryFlow": {
			kind: "single",
			scope: "root"
		} },
		store: createWorkspaceViewStore(),
		inject: browserInjected,
		locale: NS
	}, WorkspaceBrowser));
	ctx.slots.inject("conversation.hero.workspace", () => ctx.slots.register({
		name: "conversation.hero.workspace",
		children: { "conversation.hero.workspace.directoryFlow": {
			kind: "single",
			scope: "root"
		} },
		inject: pickerInjected,
		locale: NS
	}, WorkspacePicker));
}

//#endregion
exports.apply = apply;
exports.inject = inject;
return module.exports; }})