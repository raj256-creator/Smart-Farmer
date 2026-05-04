import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { FarmLayout } from "@/components/farm-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useGetFarm } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Leaf, Trash2, Loader2, ArrowRight, ScanLine, Activity } from "lucide-react";
import { format } from "date-fns";

type FarmScan = {
  id: number; farmId: number | null; cropType: string | null; growthStage: string | null;
  healthStatus: string | null; yieldPredictionKg: number | null; harvestDaysRemaining: number | null;
  harvestWindow: string | null; diseaseDetected: string | null; nutrientDeficiency: string | null;
  confidence: number | null; analysisNotes: string | null; analyzed: boolean; createdAt: string;
};

function healthBadge(status: string | null) {
  if (!status) return <Badge variant="secondary">Pending</Badge>;
  if (status === "Excellent" || status === "Good") return <Badge className="bg-green-100 text-green-700 border-green-200">{status}</Badge>;
  if (status === "Fair") return <Badge className="bg-amber-100 text-amber-700 border-amber-200">{status}</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-red-200">{status}</Badge>;
}

export default function FarmHistory() {
  const [, params] = useRoute("/farms/:id/history");
  const [, navigate] = useLocation();
  const farmId = parseInt(params?.id ?? "0", 10);

  const { data: farm } = useGetFarm(farmId, { query: { enabled: farmId > 0 } });
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<FarmScan | null>(null);
  const [deleting, setDeleting] = useState(false);

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: scans = [], isLoading } = useQuery({
    queryKey: ["farm-scans", farmId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/farms/${farmId}/scans`);
      return r.json() as Promise<FarmScan[]>;
    },
    enabled: farmId > 0,
  });

  const filtered = filter
    ? scans.filter((s) => s.cropType?.toLowerCase().includes(filter.toLowerCase()) || s.healthStatus?.toLowerCase().includes(filter.toLowerCase()))
    : scans;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await fetch(`${BASE}/api/farms/${farmId}/scans/${deleteTarget.id}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["farm-scans", farmId] });
    setDeleteTarget(null); setDeleting(false);
  };

  return (
    <FarmLayout farmId={farmId} farmName={farm?.name}>
      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold">Scan History</h2>
            <p className="text-sm text-muted-foreground">All scan records for {farm?.name ?? "this farm"}.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Filter by crop or health..." value={filter} onChange={(e) => setFilter(e.target.value)} className="pl-9 h-9" />
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => navigate(`/farms/${farmId}/scan`)}>
              <ScanLine className="w-4 h-4" />New Scan
            </Button>
          </div>
        </div>

        {isLoading && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed rounded-2xl">
            <Leaf className="w-12 h-12 text-muted-foreground opacity-30 mb-4" />
            <h3 className="text-lg font-bold mb-2">{filter ? "No matching scans" : "No scans yet"}</h3>
            <p className="text-muted-foreground text-sm mb-6">Run a New Scan to capture crop and soil data for this farm.</p>
            <Button onClick={() => navigate(`/farms/${farmId}/scan`)} className="gap-2">
              <ScanLine className="w-4 h-4" />Start First Scan
            </Button>
          </div>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((scan) => (
            <Card key={scan.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-base truncate">{scan.cropType ?? "Unknown Crop"}</p>
                    <p className="text-xs text-muted-foreground">{scan.growthStage ?? "—"} stage</p>
                  </div>
                  {healthBadge(scan.healthStatus)}
                </div>

                <p className="text-xs text-muted-foreground">{format(new Date(scan.createdAt), "d MMM yyyy, h:mm a")}</p>

                <div className="grid grid-cols-2 gap-2 text-xs bg-muted/50 rounded-lg p-2.5 border border-border">
                  <div><p className="text-muted-foreground">Est. Yield</p><p className="font-semibold">{scan.yieldPredictionKg ? `${scan.yieldPredictionKg} kg` : "—"}</p></div>
                  <div><p className="text-muted-foreground">Harvest In</p><p className="font-semibold">{scan.harvestDaysRemaining ? `${scan.harvestDaysRemaining} days` : "—"}</p></div>
                  {scan.diseaseDetected && <div className="col-span-2"><p className="text-muted-foreground">Disease</p><p className="font-semibold text-red-600">{scan.diseaseDetected}</p></div>}
                </div>

                {scan.analysisNotes && (
                  <p className="text-xs text-muted-foreground line-clamp-2 bg-primary/5 rounded-lg px-3 py-2 border border-primary/10">{scan.analysisNotes}</p>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive shrink-0" onClick={() => setDeleteTarget(scan)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                  {scan.confidence != null && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                      <Activity className="w-3 h-3" />AI confidence: {Math.round(scan.confidence * 100)}%
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Scan</AlertDialogTitle>
            <AlertDialogDescription>Delete this {deleteTarget?.cropType} scan from {deleteTarget?.createdAt ? format(new Date(deleteTarget.createdAt), "d MMM yyyy") : ""}? Cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FarmLayout>
  );
}
