import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateKmSku } from "../hooks/useKmProjects";
import type { KmMeta } from "../lib/stages";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Pre-fill structure fields (used by "+ SKU" on a group/project header). */
  defaultMeta?: Partial<Pick<KmMeta, "retailer" | "brand" | "drop" | "project">>;
}

export default function KmCreateSkuDialog({ open, onOpenChange, defaultMeta }: Props) {
  const [name, setName] = useState("");
  const [retailer, setRetailer] = useState("");
  const [brand, setBrand] = useState("");
  const [project, setProject] = useState("");
  const [drop, setDrop] = useState("");
  const create = useCreateKmSku();

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    if (!name.trim()) return;
    await create.mutateAsync({
      name: name.trim(),
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

        <div className="space-y-3 mt-2">
          <div>
            <Label htmlFor="km-name">Название SKU *</Label>
            <Input id="km-name" value={name} onChange={e => setName(e.target.value)} placeholder="Например: Сыр Гауда 200 г" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="km-retailer">Сеть</Label>
              <Input id="km-retailer" value={retailer} onChange={e => setRetailer(e.target.value)} placeholder="X5, ВкусВилл..." />
            </div>
            <div>
              <Label htmlFor="km-brand">Бренд</Label>
              <Input id="km-brand" value={brand} onChange={e => setBrand(e.target.value)} placeholder="Бренд компании" />
            </div>
          </div>
          <div>
            <Label htmlFor="km-drop">Дроп / контракт</Label>
            <Input id="km-drop" value={drop} onChange={e => setDrop(e.target.value)} placeholder="Q2 2026, Контракт #123" />
          </div>
          <div>
            <Label htmlFor="km-project">Проект</Label>
            <Input id="km-project" value={project} onChange={e => setProject(e.target.value)} placeholder="Название линейки/проекта" />
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
