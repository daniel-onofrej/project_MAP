'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import { AGENT_TEMPLATES, TEMPLATE_CATEGORIES, createAgentFromTemplate, type AgentTemplate } from '@/lib/templates';
import type { AgentConfig } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

interface TemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (agent: AgentConfig) => void;
}

export function TemplatesDialog({ open, onOpenChange, onSelectTemplate }: TemplatesDialogProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  const filteredTemplates = selectedCategory === 'all'
    ? AGENT_TEMPLATES
    : AGENT_TEMPLATES.filter(t => t.category === selectedCategory);
  
  const handleSelectTemplate = (template: AgentTemplate) => {
    const agent = createAgentFromTemplate(template);
    onSelectTemplate(agent);
    onOpenChange(false);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Agent Templates</DialogTitle>
        </DialogHeader>
        
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
          <TabsList className="grid grid-cols-6 w-full">
            <TabsTrigger value="all">All</TabsTrigger>
            {TEMPLATE_CATEGORIES.map(cat => (
              <TabsTrigger key={cat.id} value={cat.id}>
                {cat.icon}
              </TabsTrigger>
            ))}
          </TabsList>
          
          <ScrollArea className="h-[500px] mt-4">
            <div className="grid grid-cols-2 gap-4 pr-4">
              {filteredTemplates.map(template => (
                <div
                  key={template.id}
                  className="border border-border rounded-lg p-4 hover:border-primary cursor-pointer transition-colors"
                  onClick={() => handleSelectTemplate(template)}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-2xl">{template.icon}</span>
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm mb-1">{template.name}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {TEMPLATE_CATEGORIES.find(c => c.id === template.category)?.label}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{template.description}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{template.nodes.length} nodes</span>
                    <span>•</span>
                    <span>{template.connections.length} connections</span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
