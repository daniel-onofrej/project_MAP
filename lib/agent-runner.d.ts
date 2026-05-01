import type { AgentConfig, SimulationStep, PreFlightIssue } from './types';
export declare class AgentRunner {
    private agent;
    private initialInput;
    private memory;
    constructor(agent: AgentConfig, initialInput: string);
    /** Run structural pre-flight checks before execution */
    preFlightCheck(): PreFlightIssue[];
    run(): AsyncGenerator<SimulationStep>;
    private executeNode;
    private getNextNode;
    private getAttachedRules;
}
