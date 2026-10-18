import { isValidSessionId } from '@domain/validation'

import { sanitizeBody } from './sanitize-body'
import { redactSecrets } from './secret-redaction'
import { isMcpName, toOneLineText } from './session-init-report'

/**
 * MCP サーバーの問い (Elicitation) の写しと検証 (O-10 / AD-053。規則の正本は
 * [data-model](../../../specs/018-session-answer-ui-and-composer-commands/data-model.md) §2 / §3)。
 * **純粋関数**で、SDK を import しない。renderer の送る前の確かめ・main の `validate.ts`・agents の
 * `decodeSessionControl` が**同じ述語**を呼ぶ (spec U-9)。`as` で型を偽らない。
 */

/**
 * 文字列の値の上限 (コードポイント)。`ANSWER_MAX_CODE_POINTS` (agent-session.ts) と同じ値。`agent-session.ts` が
 * 本ファイルの型を import するので、循環を避けて値を持つ。
 */
const ANSWER_MAX_CODE_POINTS = 1000

/** 待ちの上限 (renderer に出す Elicitation の同時の数。超えたら送らず `decline`)。 */
export const ELICITATION_MAX_PENDING = 4
/** form の項目の数の上限。 */
export const ELICITATION_MAX_FIELDS = 32
/** `content` のキーの数の上限 (0 を許す)。 */
export const ELICITATION_CONTENT_MAX_KEYS = 32
/** 列挙の選択肢の数の上限。 */
export const ELICITATION_ENUM_MAX_OPTIONS = 50
/** `message` の長さの上限 (コードポイント)。 */
export const ELICITATION_MESSAGE_MAX_CODE_POINTS = 2000
/** 開く URL の長さの上限。 */
export const ELICITATION_URL_MAX_LENGTH = 2048

/**
 * 宣言する dialog の種類 (`request_user_dialog`)。**空** — payload の形が SDK に無いので受けない
 * (AD-053 Decision 4)。`onUserDialog` / `supportedDialogKinds` を query の options に載せない根拠。
 */
export const SUPPORTED_DIALOG_KINDS = [] as const

/** 項目の名前 (`content` のキー) の形。 */
const FIELD_KEY_SHAPE = /^[A-Za-z0-9_.-]{1,64}$/
/** 原型を書き換えうる名前。形に合っても通さない。 */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])
const STRING_FORMATS: ReadonlySet<string> = new Set(['email', 'uri', 'date', 'date-time'])
/** 本文を読む前に無害化するバイト数。 */
const SCAN_MAX_BYTES = 8_192

export type ElicitationStringFormat = 'email' | 'uri' | 'date' | 'date-time'

interface ElicitationFieldBase {
  /** `content` のキー (`^[A-Za-z0-9_.-]{1,64}$`)。 */
  readonly key: string
  /** 表示名 (`title` を 1 行・伏せ字にしたもの。無ければ `key`)。 */
  readonly label: string
  readonly description: string
  readonly required: boolean
}

/** form の項目 (スキーマの部分集合。data-model §2)。 */
export type ElicitationField =
  | (ElicitationFieldBase & {
      readonly type: 'string'
      readonly minLength?: number
      readonly maxLength?: number
      readonly format?: ElicitationStringFormat
      readonly default?: string
    })
  | (ElicitationFieldBase & {
      readonly type: 'number' | 'integer'
      readonly minimum?: number
      readonly maximum?: number
      readonly default?: number
    })
  | (ElicitationFieldBase & { readonly type: 'boolean'; readonly default?: boolean })
  | (ElicitationFieldBase & {
      readonly type: 'enum'
      readonly options: readonly { readonly value: string; readonly label: string }[]
      readonly default?: string
    })

export interface ElicitationUrl {
  /** 開いてよい URL (http / https)。開けない URL は `null` (断る・取り消すだけ)。伏せ字にしない。 */
  readonly openUrl: string | null
  /** 表示用 (userinfo とクエリの秘密を伏せた 1 行)。 */
  readonly displayUrl: string
  readonly host: string
}

/** renderer に運ぶ Elicitation の要求 (`elicitationId` は運ばない。data-model §2)。 */
export interface ElicitationPrompt {
  readonly requestId: string
  readonly serverName: string
  readonly title: string
  readonly message: string
  readonly mode: 'form' | 'url'
  readonly url: ElicitationUrl | null
  /** form のとき。部分集合の外なら `null` (答えられない)。 */
  readonly fields: readonly ElicitationField[] | null
}

export type ElicitationAction = 'accept' | 'decline' | 'cancel'

/** `accept` のときだけ運ぶ入力の値。 */
export type ElicitationContent = Readonly<Record<string, string | number | boolean>>

export interface ElicitationResponse {
  readonly requestId: string
  readonly action: ElicitationAction
  readonly content?: ElicitationContent
}

/* ── 述語 ─────────────────────────────────────────────────────── */

function codePointLength(value: string): number {
  return Array.from(value).length
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function isSafeKey(key: string): boolean {
  return FIELD_KEY_SHAPE.test(key) && !FORBIDDEN_KEYS.has(key)
}

export function isElicitationAction(value: unknown): value is ElicitationAction {
  return value === 'accept' || value === 'decline' || value === 'cancel'
}

/**
 * `content` の形の検査 (data-model §3)。plain object (原型が `Object.prototype` か `null`)・キーは 0〜32 で
 * `^[A-Za-z0-9_.-]{1,64}$` かつ `__proto__` / `constructor` / `prototype` でない・値は文字列 (0〜1,000 コードポイント)・
 * 有限の数・真偽。
 */
export function isElicitationContent(value: unknown): value is ElicitationContent {
  if (!isPlainRecord(value)) return false
  const keys = Object.keys(value)
  if (keys.length > ELICITATION_CONTENT_MAX_KEYS) return false
  if (Object.getOwnPropertySymbols(value).length > 0) return false
  for (const key of keys) {
    if (!isSafeKey(key)) return false
    const item = value[key]
    if (typeof item === 'string') {
      if (codePointLength(item) > ANSWER_MAX_CODE_POINTS) return false
    } else if (typeof item === 'number') {
      if (!Number.isFinite(item)) return false
    } else if (typeof item !== 'boolean') {
      return false
    }
  }
  return true
}

/* ── 要求の写し ───────────────────────────────────────────────── */

function cutCodePoints(text: string, max: number): string {
  const points = Array.from(text)
  return points.length > max ? points.slice(0, max).join('') : text
}

/** 1 行の表示名 (無害化 → 1 行 → 伏せ字)。 */
function oneLineRedacted(raw: unknown, max: number): string {
  return redactSecrets(toOneLineText(raw, max))
}

/** 改行を保った本文 (無害化 → 伏せ字 → 切り詰め)。 */
function bodyText(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return cutCodePoints(
    redactSecrets(sanitizeBody(raw, SCAN_MAX_BYTES).value).trim(),
    ELICITATION_MESSAGE_MAX_CODE_POINTS
  )
}

function toUrl(raw: unknown): ElicitationUrl {
  const text = typeof raw === 'string' ? raw : ''
  const displayUrl = oneLineRedacted(text, 300)
  if (text.length === 0 || text.length > ELICITATION_URL_MAX_LENGTH) {
    return { openUrl: null, displayUrl, host: '' }
  }
  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    return { openUrl: null, displayUrl, host: '' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { openUrl: null, displayUrl, host: '' }
  }
  return { openUrl: text, displayUrl, host: parsed.host }
}

function finiteNumber(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
}

function lengthBound(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0
    ? Math.min(raw, ANSWER_MAX_CODE_POINTS)
    : undefined
}

function codePointsBetween(raw: unknown, min: number, max: number): raw is string {
  if (typeof raw !== 'string') return false
  const n = codePointLength(raw)
  return n >= min && n <= max
}

/** 列挙の選択肢 (`enum` + `enumNames` か `oneOf` の `const` / `title`)。部分集合の外なら null。 */
function toEnumOptions(
  property: Record<string, unknown>
): { value: string; label: string }[] | null {
  const { enum: values, oneOf, enumNames } = property
  if (Array.isArray(values)) {
    if (values.length < 1 || values.length > ELICITATION_ENUM_MAX_OPTIONS) return null
    const names: unknown = Array.isArray(enumNames) ? enumNames : []
    const options: { value: string; label: string }[] = []
    for (let i = 0; i < values.length; i += 1) {
      const value: unknown = values[i]
      if (!codePointsBetween(value, 1, 200)) return null
      const name: unknown = Array.isArray(names) ? names[i] : undefined
      const label = oneLineRedacted(name, 120)
      options.push({ value, label: label === '' ? oneLineRedacted(value, 120) || value : label })
    }
    return options
  }
  if (Array.isArray(oneOf)) {
    if (oneOf.length < 1 || oneOf.length > ELICITATION_ENUM_MAX_OPTIONS) return null
    const options: { value: string; label: string }[] = []
    for (const item of oneOf as readonly unknown[]) {
      if (!isPlainRecord(item)) return null
      const value = item.const
      if (!codePointsBetween(value, 1, 200)) return null
      const label = oneLineRedacted(item.title, 120)
      options.push({ value, label: label === '' ? oneLineRedacted(value, 120) || value : label })
    }
    return options
  }
  return null
}

function toField(
  key: string,
  property: unknown,
  required: ReadonlySet<string>
): ElicitationField | null {
  if (!isSafeKey(key) || !isPlainRecord(property)) return null
  const label = oneLineRedacted(property.title, 120)
  const base: ElicitationFieldBase = {
    key,
    label: label === '' ? key : label,
    description: oneLineRedacted(property.description, 300),
    required: required.has(key)
  }
  const type = property.type
  if (type === 'string' && (property.enum !== undefined || property.oneOf !== undefined)) {
    const options = toEnumOptions(property)
    if (options === null) return null
    const def = property.default
    return {
      ...base,
      type: 'enum',
      options,
      ...(typeof def === 'string' && options.some((o) => o.value === def) ? { default: def } : {})
    }
  }
  switch (type) {
    case 'string': {
      const minLength = lengthBound(property.minLength)
      const maxLength = lengthBound(property.maxLength)
      const format =
        typeof property.format === 'string' && STRING_FORMATS.has(property.format)
          ? (property.format as ElicitationStringFormat)
          : undefined
      const def =
        typeof property.default === 'string'
          ? cutCodePoints(sanitizeBody(property.default, SCAN_MAX_BYTES).value, ANSWER_MAX_CODE_POINTS)
          : undefined
      return {
        ...base,
        type: 'string',
        ...(minLength !== undefined ? { minLength } : {}),
        ...(maxLength !== undefined ? { maxLength } : {}),
        ...(format !== undefined ? { format } : {}),
        ...(def !== undefined ? { default: def } : {})
      }
    }
    case 'number':
    case 'integer': {
      const minimum = finiteNumber(property.minimum)
      const maximum = finiteNumber(property.maximum)
      const def = finiteNumber(property.default)
      return {
        ...base,
        type,
        ...(minimum !== undefined ? { minimum } : {}),
        ...(maximum !== undefined ? { maximum } : {}),
        ...(def !== undefined ? { default: def } : {})
      }
    }
    case 'boolean':
      return {
        ...base,
        type: 'boolean',
        ...(typeof property.default === 'boolean' ? { default: property.default } : {})
      }
    default:
      return null
  }
}

/** `requestedSchema` → 項目の列 (部分集合の外・1 つでも外れたら null)。 */
function toFields(schema: unknown): readonly ElicitationField[] | null {
  if (!isPlainRecord(schema) || schema.type !== 'object') return null
  const properties = schema.properties
  if (!isPlainRecord(properties)) return null
  const keys = Object.keys(properties)
  if (keys.length < 1 || keys.length > ELICITATION_MAX_FIELDS) return null
  const required = new Set<string>(
    Array.isArray(schema.required)
      ? (schema.required as readonly unknown[]).filter((k): k is string => typeof k === 'string')
      : []
  )
  const fields: ElicitationField[] = []
  for (const key of keys) {
    const field = toField(key, properties[key], required)
    if (field === null) return null
    fields.push(field)
  }
  return fields
}

/**
 * SDK の `ElicitationRequest` (未信頼) → renderer に運ぶ要求 (data-model §2)。`elicitationId` は写さない。
 * 形が崩れていても例外にせず、読めない部分を空・`fields: null` に倒す。
 */
export function toElicitationPrompt(raw: unknown, requestId: string): ElicitationPrompt {
  const record = isPlainRecord(raw) ? raw : {}
  const mode: 'form' | 'url' = record.mode === 'url' ? 'url' : 'form'
  const title =
    oneLineRedacted(record.title, 120) !== ''
      ? oneLineRedacted(record.title, 120)
      : oneLineRedacted(record.displayName, 120)
  const message = bodyText(record.message) !== '' ? bodyText(record.message) : bodyText(record.description)
  return {
    requestId,
    serverName: isMcpName(record.serverName) ? record.serverName : '',
    title,
    message,
    mode,
    url: mode === 'url' ? toUrl(record.url) : null,
    fields: mode === 'form' ? toFields(record.requestedSchema) : null
  }
}

/* ── 照合 ─────────────────────────────────────────────────────── */

function matchesField(field: ElicitationField, value: string | number | boolean): boolean {
  switch (field.type) {
    case 'string': {
      if (typeof value !== 'string') return false
      if (field.required && value.trim().length === 0) return false
      const n = codePointLength(value)
      if (n > ANSWER_MAX_CODE_POINTS) return false
      if (field.minLength !== undefined && n < field.minLength) return false
      if (field.maxLength !== undefined && n > field.maxLength) return false
      return true
    }
    case 'number':
    case 'integer':
      if (typeof value !== 'number' || !Number.isFinite(value)) return false
      if (field.type === 'integer' && !Number.isInteger(value)) return false
      if (field.minimum !== undefined && value < field.minimum) return false
      if (field.maximum !== undefined && value > field.maximum) return false
      return true
    case 'boolean':
      return typeof value === 'boolean'
    case 'enum':
      return typeof value === 'string' && field.options.some((o) => o.value === value)
  }
}

/**
 * `content` が項目の形に合うか (data-model §3 の表の最後の行)。`content` が無ければ `{}` として照合する。
 * `fields` が `null` (部分集合の外) なら false。キーの集合 ⊆ 項目のキー・必須が全部ある・値の型と範囲が合う。
 */
export function matchesElicitationSchema(
  fields: readonly ElicitationField[] | null,
  content: ElicitationContent | undefined
): boolean {
  if (fields === null) return false
  const values = content ?? {}
  const known = new Map<string, ElicitationField>()
  for (const field of fields) known.set(field.key, field)
  const keys = Object.keys(values)
  for (const key of keys) {
    if (!known.has(key)) return false
  }
  for (const field of fields) {
    const present = Object.hasOwn(values, field.key)
    if (!present) {
      if (field.required) return false
      continue
    }
    const value = values[field.key]
    if (value === undefined || !matchesField(field, value)) return false
  }
  return true
}

/* ── 受け口の検査 (renderer の decoder。agents が写した値を境界の外から受けるので、形と上限を確かめ直す) ───── */

function isShortText(value: unknown, maxCodePoints: number): value is string {
  return typeof value === 'string' && codePointLength(value) <= maxCodePoints
}

function isOpenableUrl(value: string): boolean {
  if (value.length === 0 || value.length > ELICITATION_URL_MAX_LENGTH) return false
  try {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function decodeUrl(value: unknown): ElicitationUrl | null {
  if (!isPlainRecord(value)) return null
  const { openUrl, displayUrl, host } = value
  if (!isShortText(displayUrl, 300) || !isShortText(host, 300)) return null
  if (openUrl === null) return { openUrl: null, displayUrl, host }
  if (typeof openUrl !== 'string' || !isOpenableUrl(openUrl)) return null
  return { openUrl, displayUrl, host }
}

function decodeField(value: unknown): ElicitationField | null {
  if (!isPlainRecord(value)) return null
  const { key, label, description, required, type } = value
  if (typeof key !== 'string' || !isSafeKey(key)) return null
  if (!isShortText(label, 120) || !isShortText(description, 300)) return null
  if (typeof required !== 'boolean') return null
  const base: ElicitationFieldBase = { key, label, description, required }
  const optNumber = (raw: unknown): number | undefined | null =>
    raw === undefined ? undefined : typeof raw === 'number' && Number.isFinite(raw) ? raw : null
  switch (type) {
    case 'string': {
      const { minLength, maxLength, format, default: def } = value
      for (const bound of [minLength, maxLength]) {
        if (
          bound !== undefined &&
          !(typeof bound === 'number' && Number.isInteger(bound) && bound >= 0 && bound <= 1000)
        ) {
          return null
        }
      }
      if (format !== undefined && !(typeof format === 'string' && STRING_FORMATS.has(format))) {
        return null
      }
      if (def !== undefined && !isShortText(def, ANSWER_MAX_CODE_POINTS)) return null
      return {
        ...base,
        type: 'string',
        ...(typeof minLength === 'number' ? { minLength } : {}),
        ...(typeof maxLength === 'number' ? { maxLength } : {}),
        ...(typeof format === 'string' ? { format: format as ElicitationStringFormat } : {}),
        ...(typeof def === 'string' ? { default: def } : {})
      }
    }
    case 'number':
    case 'integer': {
      const minimum = optNumber(value.minimum)
      const maximum = optNumber(value.maximum)
      const def = optNumber(value.default)
      if (minimum === null || maximum === null || def === null) return null
      return {
        ...base,
        type,
        ...(minimum !== undefined ? { minimum } : {}),
        ...(maximum !== undefined ? { maximum } : {}),
        ...(def !== undefined ? { default: def } : {})
      }
    }
    case 'boolean': {
      const def = value.default
      if (def !== undefined && typeof def !== 'boolean') return null
      return { ...base, type: 'boolean', ...(def !== undefined ? { default: def } : {}) }
    }
    case 'enum': {
      const { options, default: def } = value
      if (!Array.isArray(options)) return null
      if (options.length < 1 || options.length > ELICITATION_ENUM_MAX_OPTIONS) return null
      const decoded: { value: string; label: string }[] = []
      for (const option of options as readonly unknown[]) {
        if (!isPlainRecord(option)) return null
        if (!codePointsBetween(option.value, 1, 200) || !isShortText(option.label, 120)) return null
        decoded.push({ value: option.value, label: option.label })
      }
      if (def !== undefined && typeof def !== 'string') return null
      return {
        ...base,
        type: 'enum',
        options: decoded,
        ...(typeof def === 'string' ? { default: def } : {})
      }
    }
    default:
      return null
  }
}

/**
 * `elicitation-request` の `request` を受け口で確かめる (形と上限。data-model §2 の型)。外れたら `null` (破棄)。
 * 検証を通した値だけで組み直す (余分なキー・`elicitationId` は運ばない)。
 */
export function decodeElicitationPrompt(value: unknown): ElicitationPrompt | null {
  if (!isPlainRecord(value)) return null
  const { requestId, serverName, title, message, mode, url, fields } = value
  if (!isValidSessionId(requestId)) return null
  if (typeof serverName !== 'string' || (serverName !== '' && !isMcpName(serverName))) return null
  if (!isShortText(title, 120) || !isShortText(message, ELICITATION_MESSAGE_MAX_CODE_POINTS)) {
    return null
  }
  if (mode === 'url') {
    const decodedUrl = decodeUrl(url)
    if (decodedUrl === null || fields !== null) return null
    return { requestId, serverName, title, message, mode, url: decodedUrl, fields: null }
  }
  if (mode !== 'form' || url !== null) return null
  if (fields === null) {
    return { requestId, serverName, title, message, mode, url: null, fields: null }
  }
  if (!Array.isArray(fields)) return null
  if (fields.length < 1 || fields.length > ELICITATION_MAX_FIELDS) return null
  const decodedFields: ElicitationField[] = []
  for (const raw of fields as readonly unknown[]) {
    const field = decodeField(raw)
    if (field === null) return null
    decodedFields.push(field)
  }
  return { requestId, serverName, title, message, mode, url: null, fields: decodedFields }
}
