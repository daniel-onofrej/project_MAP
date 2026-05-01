import type { AgentConfig, SimplicityScore } from './types';
export interface ComplexityMetrics {
    cyclomaticComplexity: number;
    maxDepth: number;
    branchingFactor: number;
    totalNodes: number;
    totalEdges: number;
    cognitiveLoad: number;
    score: 'simple' | 'moderate' | 'complex' | 'very-complex';
    suggestions: string[];
}
export declare function calculateComplexity(agent: AgentConfig): ComplexityMetrics;
export declare function calculateSimplicityScore(agent: AgentConfig): SimplicityScore;
