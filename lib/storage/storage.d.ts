/**
 * Storage layer — replaces localStorage with API calls.
 * GraphRuleSettings and ProviderConfig remain in localStorage (UI preferences, not user data).
 * All agent CRUD goes through /api/agents.
 */
import type { AgentConfig, GraphRuleSettings, ProviderConfig } from '../types';
export declare function saveAgent(agent: AgentConfig): Promise<void>;
export declare function getAllAgents(): Promise<AgentConfig[]>;
export declare function getAgent(id: string): Promise<AgentConfig | null>;
export declare function deleteAgent(id: string): Promise<void>;
export declare function deleteAgentFamily(masterId: string): Promise<void>;
export declare function getAgentFamily(agentId: string): Promise<AgentConfig[]>;
export declare function exportAgent(agent: AgentConfig): void;
export declare function importAgent(file: File): Promise<AgentConfig>;
export declare function normalizeAgentConfig(data: any): AgentConfig;
export declare function incrementForkCount(_agentId: string): void;
export declare function getGraphRuleSettings(): GraphRuleSettings;
export declare function saveGraphRuleSettings(settings: GraphRuleSettings): void;
export declare function getProviderConfig(): ProviderConfig;
export declare function saveProviderConfig(config: ProviderConfig): void;
