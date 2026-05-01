import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  index,
  integer,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ============================================================
// USERS
// ============================================================
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  role: text('role', { enum: ['admin', 'editor', 'viewer'] }).notNull().default('editor'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
})

// ============================================================
// GROUPS
// ============================================================
export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ============================================================
// GROUP MEMBERS
// ============================================================
export const groupMembers = pgTable(
  'group_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'editor', 'viewer'] }).notNull().default('editor'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })]
)

// ============================================================
// AGENTS
// ============================================================
export const agents = pgTable(
  'agents',
  {
    id: text('id').primaryKey(), // preserve existing string IDs
    name: text('name').notNull(),
    description: text('description'),
    originalPrompt: text('original_prompt'),
    editedPrompt: text('edited_prompt'),
    nodes: jsonb('nodes').notNull().default([]),
    connections: jsonb('connections').notNull().default([]),
    annotations: jsonb('annotations').notNull().default([]),
    settings: jsonb('settings').notNull().default({}),
    version: text('version'),
    sourceFormat: text('source_format'),
    generatedWith: text('generated_with'),
    currentVersionId: uuid('current_version_id'), // FK added separately (circular)
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => groups.id, { onDelete: 'set null' }),
    isPublicInOrg: boolean('is_public_in_org').notNull().default(false),
    parentAgentId: text('parent_agent_id').references((): any => agents.id, {
      onDelete: 'set null',
    }),
    childAgentIds: text('child_agent_ids').array().notNull().default([]),
    agentRole: text('agent_role'),
    hubMeta: jsonb('hub_meta'),
    rawLlmOutput: text('raw_llm_output'),
    pullCount: integer('pull_count').notNull().default(0),
    lastPulledAt: timestamp('last_pulled_at', { withTimezone: true }),
    lastPulledBy: text('last_pulled_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('agents_owner_id_idx').on(t.ownerId),
    index('agents_group_id_idx').on(t.groupId),
    index('agents_updated_at_idx').on(t.updatedAt),
  ]
)

// ============================================================
// AGENT VERSIONS
// ============================================================
export const agentVersions = pgTable(
  'agent_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    versionLabel: text('version_label').notNull(),
    nodes: jsonb('nodes').notNull(),
    connections: jsonb('connections').notNull(),
    commitMessage: text('commit_message'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentVersionId: uuid('parent_version_id').references((): any => agentVersions.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('agent_versions_agent_id_idx').on(t.agentId, t.createdAt)]
)

// ============================================================
// AGENT SHARES
// ============================================================
export const agentShares = pgTable(
  'agent_shares',
  {
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    permission: text('permission', { enum: ['view', 'edit', 'comment'] })
      .notNull()
      .default('view'),
    sharedBy: uuid('shared_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.agentId, t.userId] })]
)

// ============================================================
// AUDIT LOG
// ============================================================
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: text('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    // eventType values:
    //   node_added | node_updated | node_removed
    //   connection_added | connection_removed
    //   agent_created | agent_deleted | prompt_updated
    //   version_committed | simulation_run | agent_shared
    diff: jsonb('diff'), // { before: {...}, after: {...} }
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_agent_id_idx').on(t.agentId, t.createdAt),
    index('audit_log_user_id_idx').on(t.userId, t.createdAt),
    index('audit_log_created_at_idx').on(t.createdAt),
  ]
)

// ============================================================
// COMMENTS
// ============================================================
export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    nodeId: text('node_id'), // NULL = graph-level comment
    content: text('content').notNull(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('comments_agent_id_idx').on(t.agentId, t.createdAt)]
)

// ============================================================
// NODE LOCKS  (Figma-style lock model)
// ============================================================
export const nodeLocks = pgTable(
  'node_locks',
  {
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    nodeId: text('node_id').notNull(),
    lockedBy: uuid('locked_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lockedAt: timestamp('locked_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.agentId, t.nodeId] }),
    index('node_locks_expires_at_idx').on(t.expiresAt),
  ]
)

// ============================================================
// SESSIONS  (server-side, allows instant revocation)
// ============================================================
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').unique().notNull(), // sha256(raw_token)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
  },
  (t) => [
    index('sessions_token_hash_idx').on(t.tokenHash),
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ]
)

// ============================================================
// RELATIONS (for Drizzle relational queries)
// ============================================================
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  agents: many(agents),
  groupMembers: many(groupMembers),
  comments: many(comments),
  auditLogs: many(auditLog),
}))

// ============================================================
// GROUP API KEYS  (encrypted, per-provider, per-group)
// ============================================================
export const groupApiKeys = pgTable(
  'group_api_keys',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    // provider: 'gemini' | 'openai' | 'anthropic' | 'groq' | 'custom'
    provider: text('provider').notNull(),
    // AES-256-GCM encrypted key — never stored in plain text
    keyEnc: text('key_enc').notNull(),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.provider] })]
)

export type GroupApiKey = typeof groupApiKeys.$inferSelect

export const groupsRelations = relations(groups, ({ many, one }) => ({
  members: many(groupMembers),
  agents: many(agents),
  apiKeys: many(groupApiKeys),
  creator: one(users, { fields: [groups.createdBy], references: [users.id] }),
}))

export const agentsRelations = relations(agents, ({ one, many }) => ({
  owner: one(users, { fields: [agents.ownerId], references: [users.id] }),
  group: one(groups, { fields: [agents.groupId], references: [groups.id] }),
  versions: many(agentVersions),
  shares: many(agentShares),
  comments: many(comments),
  auditLogs: many(auditLog),
  locks: many(nodeLocks),
}))

// ============================================================
// PROMPT AGENT LINKS
// ============================================================
export const promptAgentLinks = pgTable(
  'prompt_agent_links',
  {
    promptAgentId: text('prompt_agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    consumerAgentId: text('consumer_agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.promptAgentId, t.consumerAgentId] }),
    index('pal_prompt_agent_id_idx').on(t.promptAgentId),
    index('pal_consumer_agent_id_idx').on(t.consumerAgentId),
  ]
)

export type PromptAgentLink = typeof promptAgentLinks.$inferSelect

// ============================================================
// MCP API TOKENS
// ============================================================
export const mcpTokens = pgTable(
  'mcp_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    tokenHash: text('token_hash').unique().notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    scopes: text('scopes').array().notNull().default([]),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('mcp_tokens_token_hash_idx').on(t.tokenHash),
    index('mcp_tokens_created_by_idx').on(t.createdBy),
  ]
)

// ============================================================
// PATTERNS
// ============================================================
export const patterns = pgTable('patterns', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category').notNull(),
  domain: text('domain'),
  complexity: text('complexity').notNull().default('simple'),
  icon: text('icon').notNull().default('🔧'),
  tags: text('tags').array().default([]),
  templateNodes: jsonb('template_nodes').notNull(),
  templateConnections: jsonb('template_connections').notNull(),
  entryNodeId: text('entry_node_id').notNull(),
  exitNodeIds: text('exit_node_ids').array().notNull().default([]),
  promptFragment: text('prompt_fragment'),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  groupId: uuid('group_id').references(() => groups.id, { onDelete: 'set null' }),
  isPublic: boolean('is_public').notNull().default(false),
  isBuiltIn: boolean('is_built_in').notNull().default(false),
  usageCount: integer('usage_count').notNull().default(0),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('patterns_owner_idx').on(t.ownerId),
  index('patterns_group_idx').on(t.groupId),
  index('patterns_public_idx').on(t.isPublic),
  index('patterns_builtin_idx').on(t.isBuiltIn),
])

// ============================================================
// EXPORTED TYPES
// ============================================================
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Agent = typeof agents.$inferSelect
export type NewAgent = typeof agents.$inferInsert
export type AgentVersion = typeof agentVersions.$inferSelect
export type AuditLogEntry = typeof auditLog.$inferSelect
export type Comment = typeof comments.$inferSelect
export type NodeLock = typeof nodeLocks.$inferSelect
export type Session = typeof sessions.$inferSelect
export type Group = typeof groups.$inferSelect
export type McpToken = typeof mcpTokens.$inferSelect
export type Pattern = typeof patterns.$inferSelect
export type NewPattern = typeof patterns.$inferInsert
