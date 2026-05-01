/**
 * Mock community agents for the Agent Hub.
 * Shape is identical to real AgentConfig — swap this export for an API call
 * when a backend is added: replace `MOCK_COMMUNITY_AGENTS` with
 * `await fetch('/api/hub/agents').then(r => r.json())`.
 */
import type { AgentConfig } from './types';

export const MOCK_COMMUNITY_AGENTS: AgentConfig[] = [
  // ── customer-service (2 agents) ─────────────────────────────────────────────
  {
    id: 'mock-hub-001',
    name: 'Customer Support Triage',
    description:
      'Classifies incoming support tickets by urgency and topic, then routes them to the correct team queue.',
    author: 'lena.marsh',
    isPublic: true,
    version: '1.2.0',
    createdAt: '2025-09-10T08:00:00.000Z',
    updatedAt: '2025-11-20T14:30:00.000Z',
    hubMeta: {
      forkCount: 312,
      tags: ['support', 'triage', 'routing', 'nlp'],
      category: 'customer-service',
      publishedAt: '2025-09-12T10:00:00.000Z',
    },
    nodes: [
      {
        id: 'mock-hub-001-n1',
        type: 'START',
        label: 'Receive Ticket',
        description: 'Entry point — receives raw customer ticket text.',
        config: {},
        position: { x: 100, y: 100 },
      },
      {
        id: 'mock-hub-001-n2',
        type: 'CONDITION',
        label: 'Urgency Check',
        description: 'Decides whether the ticket is urgent or standard.',
        config: {},
        position: { x: 350, y: 100 },
      },
      {
        id: 'mock-hub-001-n3',
        type: 'ACTION',
        label: 'Route to Queue',
        description: 'Sends ticket to the appropriate team queue.',
        config: {},
        position: { x: 600, y: 100 },
      },
      {
        id: 'mock-hub-001-n4',
        type: 'END',
        label: 'Ticket Queued',
        description: 'Ticket successfully routed.',
        config: {},
        position: { x: 850, y: 100 },
      },
    ],
    connections: [
      { id: 'mock-hub-001-e1', source: 'mock-hub-001-n1', target: 'mock-hub-001-n2' },
      { id: 'mock-hub-001-e2', source: 'mock-hub-001-n2', target: 'mock-hub-001-n3', condition: 'always' },
      { id: 'mock-hub-001-e3', source: 'mock-hub-001-n3', target: 'mock-hub-001-n4' },
    ],
  },
  {
    id: 'mock-hub-002',
    name: 'Live Chat Escalation Bot',
    description:
      'Handles first-line chat responses and escalates to a human agent when confidence drops below threshold.',
    author: 'victor.chen',
    isPublic: true,
    version: '2.0.1',
    createdAt: '2025-07-01T09:00:00.000Z',
    updatedAt: '2025-12-05T11:45:00.000Z',
    hubMeta: {
      forkCount: 187,
      tags: ['chat', 'escalation', 'customer-service', 'live-agent'],
      category: 'customer-service',
      publishedAt: '2025-07-03T09:00:00.000Z',
    },
    nodes: [
      {
        id: 'mock-hub-002-n1',
        type: 'START',
        label: 'Chat Message In',
        description: 'Receives an incoming chat message from the user.',
        config: {},
        position: { x: 100, y: 200 },
      },
      {
        id: 'mock-hub-002-n2',
        type: 'AGENT',
        label: 'Bot Response',
        description: 'Generates an automated response.',
        config: {},
        position: { x: 350, y: 200 },
      },
      {
        id: 'mock-hub-002-n3',
        type: 'CONDITION',
        label: 'Confidence Gate',
        description: 'Checks if confidence score meets threshold.',
        config: { threshold: 0.75 },
        position: { x: 600, y: 200 },
      },
      {
        id: 'mock-hub-002-n4',
        type: 'HANDOFF',
        label: 'Escalate to Human',
        description: 'Transfers session to a live human agent.',
        config: {},
        position: { x: 850, y: 120 },
      },
      {
        id: 'mock-hub-002-n5',
        type: 'END',
        label: 'Resolved',
        description: 'Chat session closed.',
        config: {},
        position: { x: 850, y: 280 },
      },
    ],
    connections: [
      { id: 'mock-hub-002-e1', source: 'mock-hub-002-n1', target: 'mock-hub-002-n2' },
      { id: 'mock-hub-002-e2', source: 'mock-hub-002-n2', target: 'mock-hub-002-n3' },
      { id: 'mock-hub-002-e3', source: 'mock-hub-002-n3', target: 'mock-hub-002-n4', condition: 'low-confidence' },
      { id: 'mock-hub-002-e4', source: 'mock-hub-002-n3', target: 'mock-hub-002-n5', condition: 'high-confidence' },
    ],
  },

  // ── data-processing (2 agents) ───────────────────────────────────────────────
  {
    id: 'mock-hub-003',
    name: 'CSV Pipeline Processor',
    description:
      'Ingests CSV files, validates schema, transforms rows, and writes clean output to a target store.',
    author: 'priya.nair',
    isPublic: true,
    version: '3.1.0',
    createdAt: '2025-04-15T07:30:00.000Z',
    updatedAt: '2025-10-22T16:00:00.000Z',
    hubMeta: {
      forkCount: 489,
      tags: ['csv', 'etl', 'validation', 'pipeline', 'data'],
      category: 'data-processing',
      publishedAt: '2025-04-17T08:00:00.000Z',
    },
    nodes: [
      {
        id: 'mock-hub-003-n1',
        type: 'START',
        label: 'Ingest CSV',
        description: 'Reads the source CSV file into memory.',
        config: {},
        position: { x: 100, y: 300 },
      },
      {
        id: 'mock-hub-003-n2',
        type: 'RULE',
        label: 'Schema Validation',
        description: 'Validates column names and data types.',
        config: { strict: true },
        position: { x: 350, y: 300 },
      },
      {
        id: 'mock-hub-003-n3',
        type: 'TASK',
        label: 'Transform Rows',
        description: 'Applies normalisation and enrichment transforms.',
        config: {},
        position: { x: 600, y: 300 },
      },
      {
        id: 'mock-hub-003-n4',
        type: 'TOOL',
        label: 'Write Output',
        description: 'Persists clean data to the target data store.',
        config: {},
        position: { x: 850, y: 300 },
      },
      {
        id: 'mock-hub-003-n5',
        type: 'END',
        label: 'Pipeline Complete',
        description: 'All rows processed successfully.',
        config: {},
        position: { x: 1100, y: 300 },
      },
    ],
    connections: [
      { id: 'mock-hub-003-e1', source: 'mock-hub-003-n1', target: 'mock-hub-003-n2' },
      { id: 'mock-hub-003-e2', source: 'mock-hub-003-n2', target: 'mock-hub-003-n3' },
      { id: 'mock-hub-003-e3', source: 'mock-hub-003-n3', target: 'mock-hub-003-n4' },
      { id: 'mock-hub-003-e4', source: 'mock-hub-003-n4', target: 'mock-hub-003-n5' },
    ],
  },
  {
    id: 'mock-hub-004',
    name: 'Real-Time Event Aggregator',
    description:
      'Consumes streaming events, deduplicates, aggregates by window, and publishes summaries.',
    author: 'kenji.watanabe',
    isPublic: true,
    version: '1.0.3',
    createdAt: '2025-06-20T11:00:00.000Z',
    updatedAt: '2025-11-01T09:15:00.000Z',
    hubMeta: {
      forkCount: 134,
      tags: ['streaming', 'aggregation', 'events', 'dedup'],
      category: 'data-processing',
      publishedAt: '2025-06-22T12:00:00.000Z',
    },
    nodes: [
      {
        id: 'mock-hub-004-n1',
        type: 'START',
        label: 'Event Stream In',
        description: 'Subscribes to the upstream event stream.',
        config: {},
        position: { x: 100, y: 400 },
      },
      {
        id: 'mock-hub-004-n2',
        type: 'GUARD',
        label: 'Dedup Filter',
        description: 'Drops duplicate events within a 60-second window.',
        config: { windowSeconds: 60 },
        position: { x: 350, y: 400 },
      },
      {
        id: 'mock-hub-004-n3',
        type: 'TASK',
        label: 'Aggregate Window',
        description: 'Sums and groups events per configured time window.',
        config: {},
        position: { x: 600, y: 400 },
      },
      {
        id: 'mock-hub-004-n4',
        type: 'ACTION',
        label: 'Publish Summary',
        description: 'Emits aggregated summary downstream.',
        config: {},
        position: { x: 850, y: 400 },
      },
      {
        id: 'mock-hub-004-n5',
        type: 'END',
        label: 'Aggregation Complete',
        description: '',
        config: {},
        position: { x: 1100, y: 400 },
      },
    ],
    connections: [
      { id: 'mock-hub-004-e1', source: 'mock-hub-004-n1', target: 'mock-hub-004-n2' },
      { id: 'mock-hub-004-e2', source: 'mock-hub-004-n2', target: 'mock-hub-004-n3' },
      { id: 'mock-hub-004-e3', source: 'mock-hub-004-n3', target: 'mock-hub-004-n4' },
      { id: 'mock-hub-004-e4', source: 'mock-hub-004-n4', target: 'mock-hub-004-n5' },
    ],
  },

  // ── approval-workflow (2 agents) ─────────────────────────────────────────────
  {
    id: 'mock-hub-005',
    name: 'Purchase Order Approver',
    description:
      'Routes purchase order requests through a multi-level approval chain and notifies stakeholders at each step.',
    author: 'sara.okonkwo',
    isPublic: true,
    version: '1.4.2',
    createdAt: '2025-05-08T14:00:00.000Z',
    updatedAt: '2025-12-18T10:00:00.000Z',
    hubMeta: {
      forkCount: 228,
      tags: ['approval', 'procurement', 'workflow', 'finance'],
      category: 'approval-workflow',
      publishedAt: '2025-05-10T08:00:00.000Z',
    },
    nodes: [
      {
        id: 'mock-hub-005-n1',
        type: 'START',
        label: 'PO Submitted',
        description: 'Purchase order received for processing.',
        config: {},
        position: { x: 100, y: 500 },
      },
      {
        id: 'mock-hub-005-n2',
        type: 'CONDITION',
        label: 'Amount Check',
        description: 'Determines approval tier based on order amount.',
        config: { tier1Limit: 1000, tier2Limit: 10000 },
        position: { x: 350, y: 500 },
      },
      {
        id: 'mock-hub-005-n3',
        type: 'TASK',
        label: 'Manager Approval',
        description: 'Sends approval request to line manager.',
        config: {},
        position: { x: 600, y: 420 },
      },
      {
        id: 'mock-hub-005-n4',
        type: 'TASK',
        label: 'Director Approval',
        description: 'Escalates to director for high-value orders.',
        config: {},
        position: { x: 600, y: 580 },
      },
      {
        id: 'mock-hub-005-n5',
        type: 'ACTION',
        label: 'Notify Stakeholders',
        description: 'Sends email notifications on decision.',
        config: {},
        position: { x: 850, y: 500 },
      },
      {
        id: 'mock-hub-005-n6',
        type: 'END',
        label: 'PO Processed',
        description: 'Order approved or rejected and logged.',
        config: {},
        position: { x: 1100, y: 500 },
      },
    ],
    connections: [
      { id: 'mock-hub-005-e1', source: 'mock-hub-005-n1', target: 'mock-hub-005-n2' },
      { id: 'mock-hub-005-e2', source: 'mock-hub-005-n2', target: 'mock-hub-005-n3', condition: 'low-value' },
      { id: 'mock-hub-005-e3', source: 'mock-hub-005-n2', target: 'mock-hub-005-n4', condition: 'high-value' },
      { id: 'mock-hub-005-e4', source: 'mock-hub-005-n3', target: 'mock-hub-005-n5' },
      { id: 'mock-hub-005-e5', source: 'mock-hub-005-n4', target: 'mock-hub-005-n5' },
      { id: 'mock-hub-005-e6', source: 'mock-hub-005-n5', target: 'mock-hub-005-n6' },
    ],
  },
  {
    id: 'mock-hub-006',
    name: 'HR Leave Request Handler',
    description:
      'Automates employee leave requests: validates balance, notifies managers, and updates the HR system.',
    author: 'fatima.al-rashid',
    isPublic: true,
    version: '2.1.0',
    createdAt: '2025-08-14T09:00:00.000Z',
    updatedAt: '2026-01-10T13:00:00.000Z',
    hubMeta: {
      forkCount: 95,
      tags: ['hr', 'leave', 'approval', 'automation'],
      category: 'approval-workflow',
      publishedAt: '2025-08-16T10:00:00.000Z',
    },
    nodes: [
      {
        id: 'mock-hub-006-n1',
        type: 'START',
        label: 'Leave Request In',
        description: 'Employee submits a leave request form.',
        config: {},
        position: { x: 100, y: 600 },
      },
      {
        id: 'mock-hub-006-n2',
        type: 'RULE',
        label: 'Balance Validator',
        description: 'Checks if the employee has sufficient leave balance.',
        config: {},
        position: { x: 350, y: 600 },
      },
      {
        id: 'mock-hub-006-n3',
        type: 'TASK',
        label: 'Manager Review',
        description: 'Sends request to the direct manager for approval.',
        config: {},
        position: { x: 600, y: 600 },
      },
      {
        id: 'mock-hub-006-n4',
        type: 'TOOL',
        label: 'Update HR System',
        description: 'Writes approved leave to the HR platform.',
        config: {},
        position: { x: 850, y: 600 },
      },
      {
        id: 'mock-hub-006-n5',
        type: 'END',
        label: 'Request Complete',
        description: 'Leave request finalised and employee notified.',
        config: {},
        position: { x: 1100, y: 600 },
      },
    ],
    connections: [
      { id: 'mock-hub-006-e1', source: 'mock-hub-006-n1', target: 'mock-hub-006-n2' },
      { id: 'mock-hub-006-e2', source: 'mock-hub-006-n2', target: 'mock-hub-006-n3' },
      { id: 'mock-hub-006-e3', source: 'mock-hub-006-n3', target: 'mock-hub-006-n4' },
      { id: 'mock-hub-006-e4', source: 'mock-hub-006-n4', target: 'mock-hub-006-n5' },
    ],
  },

  // ── content-moderation (1 agent) ─────────────────────────────────────────────
  {
    id: 'mock-hub-007',
    name: 'UGC Safety Moderator',
    description:
      'Scans user-generated content for policy violations using classifier models, then auto-removes or flags for human review.',
    author: 'tom.bradshaw',
    isPublic: true,
    version: '4.0.0',
    createdAt: '2025-03-01T06:00:00.000Z',
    updatedAt: '2025-11-30T17:00:00.000Z',
    hubMeta: {
      forkCount: 401,
      tags: ['moderation', 'safety', 'ugc', 'classifier', 'trust-and-safety'],
      category: 'content-moderation',
      publishedAt: '2025-03-03T08:00:00.000Z',
    },
    nodes: [
      {
        id: 'mock-hub-007-n1',
        type: 'START',
        label: 'Content Submitted',
        description: 'New user-generated content arrives for review.',
        config: {},
        position: { x: 100, y: 700 },
      },
      {
        id: 'mock-hub-007-n2',
        type: 'TOOL',
        label: 'Run Classifiers',
        description: 'Applies toxicity, spam, and NSFW classifiers.',
        config: { models: ['toxicity-v2', 'spam-v3', 'nsfw-v1'] },
        position: { x: 350, y: 700 },
      },
      {
        id: 'mock-hub-007-n3',
        type: 'DECISION',
        label: 'Policy Decision',
        description: 'Decides auto-remove, flag, or approve based on scores.',
        config: { autoRemoveThreshold: 0.9, flagThreshold: 0.6 },
        position: { x: 600, y: 700 },
      },
      {
        id: 'mock-hub-007-n4',
        type: 'ACTION',
        label: 'Auto Remove',
        description: 'Immediately removes content that exceeds the threshold.',
        config: {},
        position: { x: 850, y: 620 },
      },
      {
        id: 'mock-hub-007-n5',
        type: 'HANDOFF',
        label: 'Human Review Queue',
        description: 'Sends borderline content to a moderator queue.',
        config: {},
        position: { x: 850, y: 700 },
      },
      {
        id: 'mock-hub-007-n6',
        type: 'ACTION',
        label: 'Approve',
        description: 'Marks content as safe and makes it visible.',
        config: {},
        position: { x: 850, y: 780 },
      },
      {
        id: 'mock-hub-007-n7',
        type: 'END',
        label: 'Moderation Done',
        description: 'Moderation action completed.',
        config: {},
        position: { x: 1100, y: 700 },
      },
    ],
    connections: [
      { id: 'mock-hub-007-e1', source: 'mock-hub-007-n1', target: 'mock-hub-007-n2' },
      { id: 'mock-hub-007-e2', source: 'mock-hub-007-n2', target: 'mock-hub-007-n3' },
      { id: 'mock-hub-007-e3', source: 'mock-hub-007-n3', target: 'mock-hub-007-n4', condition: 'auto-remove' },
      { id: 'mock-hub-007-e4', source: 'mock-hub-007-n3', target: 'mock-hub-007-n5', condition: 'flag' },
      { id: 'mock-hub-007-e5', source: 'mock-hub-007-n3', target: 'mock-hub-007-n6', condition: 'approve' },
      { id: 'mock-hub-007-e6', source: 'mock-hub-007-n4', target: 'mock-hub-007-n7' },
      { id: 'mock-hub-007-e7', source: 'mock-hub-007-n5', target: 'mock-hub-007-n7' },
      { id: 'mock-hub-007-e8', source: 'mock-hub-007-n6', target: 'mock-hub-007-n7' },
    ],
  },

  // ── orchestration (3 agents) ─────────────────────────────────────────────────
  {
    id: 'mock-hub-008',
    name: 'Multi-Agent Research Orchestrator',
    description:
      'Coordinates a research pipeline: a planner, search agent, synthesis agent, and writer agent work in sequence.',
    author: 'alex.rivera',
    isPublic: true,
    version: '1.1.0',
    createdAt: '2025-10-05T10:00:00.000Z',
    updatedAt: '2026-01-25T15:30:00.000Z',
    hubMeta: {
      forkCount: 376,
      tags: ['multi-agent', 'research', 'orchestration', 'pipeline'],
      category: 'orchestration',
      publishedAt: '2025-10-07T10:00:00.000Z',
    },
    nodes: [
      {
        id: 'mock-hub-008-n1',
        type: 'START',
        label: 'Research Brief',
        description: 'Receives the research topic and scope.',
        config: {},
        position: { x: 100, y: 800 },
      },
      {
        id: 'mock-hub-008-n2',
        type: 'AGENT',
        label: 'Planner Agent',
        description: 'Breaks the brief into sub-tasks and assigns agents.',
        config: {},
        position: { x: 350, y: 800 },
      },
      {
        id: 'mock-hub-008-n3',
        type: 'AGENT',
        label: 'Search Agent',
        description: 'Retrieves relevant sources and raw data.',
        config: {},
        position: { x: 600, y: 800 },
      },
      {
        id: 'mock-hub-008-n4',
        type: 'AGENT',
        label: 'Synthesis Agent',
        description: 'Combines and analyses gathered information.',
        config: {},
        position: { x: 850, y: 800 },
      },
      {
        id: 'mock-hub-008-n5',
        type: 'AGENT',
        label: 'Writer Agent',
        description: 'Produces the final report from synthesised data.',
        config: {},
        position: { x: 1100, y: 800 },
      },
      {
        id: 'mock-hub-008-n6',
        type: 'END',
        label: 'Report Delivered',
        description: 'Final research report returned to requester.',
        config: {},
        position: { x: 1350, y: 800 },
      },
    ],
    connections: [
      { id: 'mock-hub-008-e1', source: 'mock-hub-008-n1', target: 'mock-hub-008-n2' },
      { id: 'mock-hub-008-e2', source: 'mock-hub-008-n2', target: 'mock-hub-008-n3' },
      { id: 'mock-hub-008-e3', source: 'mock-hub-008-n3', target: 'mock-hub-008-n4' },
      { id: 'mock-hub-008-e4', source: 'mock-hub-008-n4', target: 'mock-hub-008-n5' },
      { id: 'mock-hub-008-e5', source: 'mock-hub-008-n5', target: 'mock-hub-008-n6' },
    ],
  },
  {
    id: 'mock-hub-009',
    name: 'Incident Response Coordinator',
    description:
      'On-call incident manager: detects anomaly, pages responders, coordinates triage, and drives postmortem creation.',
    author: 'nina.petrova',
    isPublic: true,
    version: '2.3.1',
    createdAt: '2025-02-10T04:00:00.000Z',
    updatedAt: '2025-12-28T08:00:00.000Z',
    hubMeta: {
      forkCount: 210,
      tags: ['incident-response', 'on-call', 'devops', 'alerting'],
      category: 'orchestration',
      publishedAt: '2025-02-12T08:00:00.000Z',
    },
    nodes: [
      {
        id: 'mock-hub-009-n1',
        type: 'START',
        label: 'Anomaly Detected',
        description: 'Alert fired from monitoring system.',
        config: {},
        position: { x: 100, y: 900 },
      },
      {
        id: 'mock-hub-009-n2',
        type: 'TRIGGER',
        label: 'Page On-Call',
        description: 'Pages the on-call engineer via PagerDuty.',
        config: {},
        position: { x: 350, y: 900 },
      },
      {
        id: 'mock-hub-009-n3',
        type: 'TASK',
        label: 'Triage',
        description: 'Collects logs, metrics, and traces for context.',
        config: {},
        position: { x: 600, y: 900 },
      },
      {
        id: 'mock-hub-009-n4',
        type: 'DECISION',
        label: 'Severity Assessment',
        description: 'Classifies incident as SEV1, SEV2, or SEV3.',
        config: {},
        position: { x: 850, y: 900 },
      },
      {
        id: 'mock-hub-009-n5',
        type: 'TASK',
        label: 'Postmortem Draft',
        description: 'Auto-generates postmortem template from incident data.',
        config: {},
        position: { x: 1100, y: 820 },
      },
      {
        id: 'mock-hub-009-n6',
        type: 'END',
        label: 'Incident Closed',
        description: 'Incident resolved and postmortem sent.',
        config: {},
        position: { x: 1350, y: 820 },
      },
      {
        id: 'mock-hub-009-n7',
        type: 'HANDOFF',
        label: 'Escalate P0',
        description: 'Immediately escalates critical P0 incidents to senior on-call and leadership.',
        config: {},
        position: { x: 1100, y: 980 },
      },
    ],
    connections: [
      { id: 'mock-hub-009-e1', source: 'mock-hub-009-n1', target: 'mock-hub-009-n2' },
      { id: 'mock-hub-009-e2', source: 'mock-hub-009-n2', target: 'mock-hub-009-n3' },
      { id: 'mock-hub-009-e3', source: 'mock-hub-009-n3', target: 'mock-hub-009-n4' },
      { id: 'mock-hub-009-e4', source: 'mock-hub-009-n4', target: 'mock-hub-009-n5', condition: 'sev1/sev2' },
      { id: 'mock-hub-009-e5', source: 'mock-hub-009-n5', target: 'mock-hub-009-n6' },
      { id: 'mock-hub-009-e6', source: 'mock-hub-009-n4', target: 'mock-hub-009-n7', condition: 'sev0/critical' },
    ],
  },
  {
    id: 'mock-hub-010',
    name: 'Cross-System Data Sync Orchestrator',
    description:
      'Keeps multiple downstream systems in sync: reads from a source of truth, transforms per target schema, and writes with conflict resolution.',
    author: 'marcus.del-valle',
    isPublic: true,
    version: '1.0.0',
    createdAt: '2026-01-05T12:00:00.000Z',
    updatedAt: '2026-02-10T16:00:00.000Z',
    hubMeta: {
      forkCount: 57,
      tags: ['sync', 'integration', 'orchestration', 'data'],
      category: 'orchestration',
      publishedAt: '2026-01-07T09:00:00.000Z',
    },
    nodes: [
      {
        id: 'mock-hub-010-n1',
        type: 'START',
        label: 'Sync Triggered',
        description: 'Periodic or event-driven sync job starts.',
        config: {},
        position: { x: 100, y: 1000 },
      },
      {
        id: 'mock-hub-010-n2',
        type: 'TOOL',
        label: 'Read Source of Truth',
        description: 'Fetches the canonical dataset from the master system.',
        config: {},
        position: { x: 350, y: 1000 },
      },
      {
        id: 'mock-hub-010-n3',
        type: 'TASK',
        label: 'Transform for Targets',
        description: 'Applies per-target schema transformations.',
        config: {},
        position: { x: 600, y: 1000 },
      },
      {
        id: 'mock-hub-010-n4',
        type: 'GUARD',
        label: 'Conflict Resolver',
        description: 'Detects and resolves write conflicts before committing.',
        config: {},
        position: { x: 850, y: 1000 },
      },
      {
        id: 'mock-hub-010-n5',
        type: 'ACTION',
        label: 'Write to Targets',
        description: 'Commits transformed data to each downstream system.',
        config: {},
        position: { x: 1100, y: 1000 },
      },
      {
        id: 'mock-hub-010-n6',
        type: 'END',
        label: 'Sync Complete',
        description: 'All targets updated successfully.',
        config: {},
        position: { x: 1350, y: 1000 },
      },
    ],
    connections: [
      { id: 'mock-hub-010-e1', source: 'mock-hub-010-n1', target: 'mock-hub-010-n2' },
      { id: 'mock-hub-010-e2', source: 'mock-hub-010-n2', target: 'mock-hub-010-n3' },
      { id: 'mock-hub-010-e3', source: 'mock-hub-010-n3', target: 'mock-hub-010-n4' },
      { id: 'mock-hub-010-e4', source: 'mock-hub-010-n4', target: 'mock-hub-010-n5' },
      { id: 'mock-hub-010-e5', source: 'mock-hub-010-n5', target: 'mock-hub-010-n6' },
    ],
  },
];

/**
 * Returns the top N agents sorted by hubMeta.forkCount descending.
 * Agents without hubMeta are treated as forkCount=0.
 */
export function getTrendingAgents(agents: AgentConfig[], n = 3): AgentConfig[] {
  if (n <= 0) return [];
  return [...agents]
    .sort((a, b) => (b.hubMeta?.forkCount ?? 0) - (a.hubMeta?.forkCount ?? 0))
    .slice(0, n);
}

/**
 * Returns all unique tags across all agents, sorted alphabetically.
 * Tags are collected from each agent's hubMeta.tags array.
 */
export function getAllTags(agents: AgentConfig[]): string[] {
  const tagSet = new Set<string>();
  for (const agent of agents) {
    if (agent.hubMeta?.tags) {
      for (const tag of agent.hubMeta.tags) {
        const trimmed = tag.trim();
        if (trimmed) tagSet.add(trimmed);
      }
    }
  }
  return Array.from(tagSet).sort();
}
