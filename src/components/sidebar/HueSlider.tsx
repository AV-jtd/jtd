import { useState } from "react";
import type { TaskGroup } from "@/hooks/useTasks";

interface HueSliderProps {
  group: TaskGroup;
  onColorChange: (id: string, color: string) => void;
  onDone: () => void;
}

export default function HueSlider({ group, onColorChange, onDone }: HueSliderProps) {
  const [hue, setHue] = useState(() => {
    const match = group.color?.match(/hsl\((\d+)/);
    return match ? parseInt(match[1]) : 220;
  });

  const handleCommit = () => {
    onColorChange(group.id, `hsl(${hue}, 70%, 50%)`);
    onDone();
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min="0"
        max="360"
        value={hue}
        onChange={(e) => setHue(parseInt(e.target.value))}
        onPointerUp={handleCommit}
        onMouseUp={handleCommit}
        className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
        style={{
          background:
            "linear-gradient(to right, hsl(0,70%,50%), hsl(60,70%,50%), hsl(120,70%,50%), hsl(180,70%,50%), hsl(240,70%,50%), hsl(300,70%,50%), hsl(360,70%,50%))",
        }}
      />
      <div
        className="h-5 w-5 rounded-full border border-border shrink-0"
        style={{ backgroundColor: `hsl(${hue}, 70%, 50%)` }}
      />
    </div>
  );
}
