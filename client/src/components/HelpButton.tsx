import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface HelpStep {
  step: number;
  title: string;
  desc: string;
}

interface HelpButtonProps {
  title: string;
  steps: HelpStep[];
  tips?: string[];
}

export default function HelpButton({ title, steps, tips }: HelpButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
        title="查看操作帮助"
      >
        <HelpCircle className="w-5 h-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-blue-500" />
              {title} — 操作指南
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* 操作步骤 */}
            <div className="space-y-3">
              {steps.map((s) => (
                <div key={s.step} className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                    {s.step}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* 注意事项 */}
            {tips && tips.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-amber-700 mb-2">注意事项</p>
                <ul className="space-y-1">
                  {tips.map((tip, i) => (
                    <li key={i} className="text-xs text-amber-800 flex gap-1.5">
                      <span className="text-amber-500 flex-shrink-0">•</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
