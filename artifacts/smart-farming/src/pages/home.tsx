import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListFarms,
  useCreateFarm,
  useUpdateFarm,
  useDeleteFarm,
  getListFarmsQueryKey,
} from "@workspace/api-client-react";
import type { Farm } from "@workspace/api-client-react";
import {
  Plus,
  MapPin,
  Pencil,
  Trash2,
  Loader2,
  ArrowRight,
  Leaf,
  Ruler,
} from "lucide-react";

const CROP_OPTIONS = ["Mango", "Dragon Fruit", "Chikoo", "Pomegranate", "Mulberry"] as const;
const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "monitoring", label: "Monitoring" },
  { value: "inactive", label: "Inactive" },
] as const;

type FarmFormData = {
  name: string;
  location: string;
  description: string;
  status: string;
  acreage: string;
  crops: string[];
};

const emptyForm: FarmFormData = {
  name: "",
  location: "",
  description: "",
  status: "active",
  acreage: "",
  crops: [],
};

function statusBadge(status: string) {
  if (status === "active") return <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20">Active</Badge>;
  if (status === "monitoring") return <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/20">Monitoring</Badge>;
  return <Badge variant="secondary">Inactive</Badge>;
}

export default function Home() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFarm, setEditingFarm] = useState<Farm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Farm | null>(null);
  const [form, setForm] = useState<FarmFormData>(emptyForm);

  const { data: farmList = [], isLoading } = useListFarms();

  const createFarm = useCreateFarm({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFarmsQueryKey() });
        setDialogOpen(false);
        setForm(emptyForm);
      },
    },
  });

  const updateFarm = useUpdateFarm({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFarmsQueryKey() });
        setDialogOpen(false);
        setEditingFarm(null);
        setForm(emptyForm);
      },
    },
  });

  const deleteFarm = useDeleteFarm({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFarmsQueryKey() });
        setDeleteTarget(null);
      },
    },
  });

  const openCreate = () => {
    setEditingFarm(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (farm: Farm) => {
    setEditingFarm(farm);
    setForm({
      name: farm.name,
      location: farm.location,
      description: farm.description ?? "",
      status: farm.status,
      acreage: farm.acreage ?? "",
      crops: (farm.crops as string[]) ?? [],
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      location: form.location,
      description: form.description || null,
      status: form.status,
      acreage: form.acreage || null,
      crops: form.crops,
    };
    if (editingFarm) {
      await updateFarm.mutateAsync({ id: editingFarm.id, data: payload });
    } else {
      await createFarm.mutateAsync({ data: payload });
    }
  };

  const toggleCrop = (crop: string) => {
    setForm((f) => ({
      ...f,
      crops: f.crops.includes(crop) ? f.crops.filter((c) => c !== crop) : [...f.crops, crop],
    }));
  };

  const isBusy = createFarm.isPending || updateFarm.isPending;

  return (
    <Layout>
      <div className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">My Farms</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage your farms and monitor crop performance with AI insights.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Farm
          </Button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && farmList.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Leaf className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-2">No farms yet</h2>
            <p className="text-muted-foreground text-sm max-w-sm mb-6">
              Add your first farm to start monitoring crops, analyzing soil health, and getting AI recommendations.
            </p>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Your First Farm
            </Button>
          </div>
        )}

        {/* Farm cards grid */}
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {farmList.map((farm) => {
            const cropList = (farm.crops as string[]) ?? [];
            return (
              <Card key={farm.id} className="flex flex-col hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-lg truncate">{farm.name}</h3>
                      <div className="flex items-center gap-1 text-muted-foreground text-sm mt-0.5">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{farm.location}</span>
                      </div>
                    </div>
                    {statusBadge(farm.status)}
                  </div>
                </CardHeader>

                <CardContent className="flex-1 space-y-3 pb-4">
                  {farm.acreage && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Ruler className="w-3.5 h-3.5" />
                      <span>{parseFloat(farm.acreage).toFixed(1)} acres</span>
                    </div>
                  )}

                  {cropList.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {cropList.map((c) => (
                        <Badge key={c} variant="outline" className="text-xs bg-primary/5 border-primary/20 text-primary">
                          {c}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No crops added</p>
                  )}

                  {farm.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{farm.description}</p>
                  )}
                </CardContent>

                <CardFooter className="pt-0 flex gap-2">
                  <Button
                    className="flex-1 gap-1.5"
                    onClick={() => navigate(`/farms/${farm.id}`)}
                  >
                    Open Farm <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => openEdit(farm)}
                    title="Edit farm"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setDeleteTarget(farm)}
                    title="Delete farm"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!isBusy) { setDialogOpen(open); if (!open) setEditingFarm(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingFarm ? "Edit Farm" : "Add New Farm"}</DialogTitle>
            <DialogDescription>
              {editingFarm ? "Update the farm details below." : "Enter details for your new farm."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Farm Name <span className="text-destructive">*</span></Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Green Valley Farm"
                  required
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Location <span className="text-destructive">*</span></Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. Nashik, Maharashtra"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Land Area (acres)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.acreage}
                  onChange={(e) => setForm((f) => ({ ...f, acreage: e.target.value }))}
                  placeholder="e.g. 5.5"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Optional notes about this farm"
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Crops Grown</Label>
                <div className="flex flex-wrap gap-2">
                  {CROP_OPTIONS.map((crop) => (
                    <button
                      key={crop}
                      type="button"
                      onClick={() => toggleCrop(crop)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        form.crops.includes(crop)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {crop}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={isBusy}>
                Cancel
              </Button>
              <Button type="submit" disabled={isBusy || !form.name || !form.location}>
                {isBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingFarm ? "Save Changes" : "Create Farm"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Farm</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteFarm.mutate({ id: deleteTarget.id })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFarm.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
