import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCreateStmSku } from "../hooks/useStmProjects";
import type { StmFlow, StmMeta } from "../lib/stages";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultFlow?: StmFlow;
  /** Pre-fill structure fields (used by "+ SKU" on a group/project header). */
  defaultMeta?: Partial<Pick<StmMeta, "retailer" | "brand" | "drop" | "project">>;
}

export default function StmCreateSkuDialog({ open, onOpenChange, defaultFlow = "in", defaultMeta }: Props) {
  const [name, setName] = useState("");
  const [retailer, setRetailer] = useState("");
  const [brand, setBrand] = useState("");
  const [project, setProject] = useState("");
  const [drop, setDrop] = useState("");
  const [flow, setFlow] = useState<StmFlow>(defaultFlow);
  const create = useCreateStmSku();

  const reset = () => {
    setName("");
    setRetailer(defaultMeta?.retailer ?? "");
    setBrand(defaultMeta?.brand ?? "");
    setProject(defaultMeta?.project ?? "");
    setDrop(defaultMeta?.drop ?? "");
  };

  // Apply pre-filled structure fields whenever the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      setName("");
      setRetailer(defaultMeta?.retailer ?? "");
      setBrand(defaultMeta?.brand ?? "");
      setProject(defaultMeta?.project ?? "");
      setDrop(defaultMeta?.drop ?? "");
      setFlow(defaultFlow);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    if (!name.trim()) return;
    await create.mutateAsync({
      name: name.trim(),
      flow,
      meta: {
        retailer: retailer.trim() || undefined,
        brand: brand.trim() || undefined,
        project: project.trim() || undefined,
        drop: drop.trim() || undefined,
      },
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Новый SKU</DialogTitle>
        </DialogHeader>

        <Tabs value={flow} onValueChange={(v) => setFlow(v as StmFlow)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="in">Ввод SKU</TabsTrigger>
            <TabsTrigger value="out">Вывод SKU</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-3 mt-2">
          <div>
            <Label htmlFor="stm-name">Название SKU *</Label>
            <Input id="stm-name" value={name} onChange={e => setName(e.target.value)} placeholder="Например: Сыр Гауда 200 г" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="stm-retailer">Сеть</Label>
              <Input id="stm-retailer" value={retailer} onChange={e => setRetailer(e.target.value)} placeholder="X5, ВкусВилл..." />
            </div>
            <div>
              <Label htmlFor="stm-brand">Бренд</Label>
              <Input id="stm-brand" value={brand} onChange={e => setBrand(e.target.value)} placeholder="СТМ / собственный" />
            </div>
          </div>
          <div>
            <Label htmlFor="stm-drop">Дроп / контракт</Label>
            <Input id="stm-drop" value={drop} onChange={e => setDrop(e.target.value)} placeholder="Q2 2026, Контракт #123" />
          </div>
          <div>
            <Label htmlFor="stm-project">Проект</Label>
            <Input id="stm-project" value={project} onChange={e => setProject(e.target.value)} placeholder="Бережное томление, Чистые составы..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={submit} disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Создание..." : "Создать SKU"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}