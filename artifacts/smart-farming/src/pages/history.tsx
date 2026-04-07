import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { useListCropScans, useDeleteCropScan, getListCropScansQueryKey, getGetDashboardSummaryQueryKey, getGetRecentScansQueryKey, getGetCropStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Link } from "wouter";
import { format } from "date-fns";
import { Search, ArrowRight, Leaf, Trash2, Loader2 } from "lucide-react";

export default function History() {
  const [filter, setFilter] = useState("");
  const [isClearing, setIsClearing] = useState(false);
  const queryClient = useQueryClient();
  
  const { data: scans, isLoading } = useListCropScans({}, {
    query: {
      queryKey: getListCropScansQueryKey({})
    }
  });

  const deleteScan = useDeleteCropScan();

  const handleClearHistory = async () => {
    if (!scans || scans.length === 0) return;
    setIsClearing(true);
    try {
      await Promise.all(scans.map((s) => deleteScan.mutateAsync({ id: s.id })));
      await queryClient.invalidateQueries({ queryKey: getListCropScansQueryKey({}) });
      await queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetRecentScansQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetCropStatsQueryKey() });
    } finally {
      setIsClearing(false);
    }
  };

  const filteredScans = scans?.filter(s => 
    !filter || s.cropType?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <Layout>
      <div className="p-6 sm:p-10 max-w-7xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Scan History</h1>
            <p className="text-muted-foreground mt-1">Review all your past crop analysis records.</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Filter by crop type..." 
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-9"
              />
            </div>
            {scans && scans.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive" disabled={isClearing}>
                    {isClearing ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Clear History
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all scan history?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all {scans.length} scan record{scans.length !== 1 ? "s" : ""} including their analysis data, soil readings, and climate logs. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleClearHistory}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Yes, clear history
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array(6).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        ) : filteredScans?.length === 0 ? (
          <div className="text-center py-20 bg-secondary/50 rounded-2xl border border-border">
            <Leaf className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">No scans found</h3>
            <p className="text-muted-foreground mb-6">Start by creating your first crop scan.</p>
            <Link href="/scan/new">
              <Button>Create Scan</Button>
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredScans?.map((scan) => (
              <Card key={scan.id} className="flex flex-col overflow-hidden hover:border-primary/50 transition-colors">
                <div className="h-40 bg-secondary relative">
                  {scan.imageUrl ? (
                    <img src={scan.imageUrl} alt={scan.cropType || "Crop"} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Leaf className="w-8 h-8 opacity-20" />
                    </div>
                  )}
                  <div className="absolute top-3 right-3">
                    <Badge variant={scan.healthStatus === "Healthy" ? "default" : scan.healthStatus === "Diseased" ? "destructive" : "secondary"}>
                      {scan.healthStatus || "Pending"}
                    </Badge>
                  </div>
                </div>
                <CardContent className="pt-5 flex-1">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg">{scan.cropType || "Unknown Crop"}</h3>
                  </div>
                  <div className="text-sm text-muted-foreground mb-4">
                    {format(new Date(scan.createdAt), 'MMM d, yyyy • h:mm a')}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm bg-background p-3 rounded-lg border border-border">
                    <div>
                      <span className="text-muted-foreground block text-xs">Est. Yield</span>
                      <span className="font-semibold">{scan.yieldPredictionKg ? `${scan.yieldPredictionKg} kg` : '-'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs">Growth Stage</span>
                      <span className="font-semibold truncate block">{scan.growthStage || '-'}</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="pt-0 pb-4 px-6 border-t border-border mt-auto pt-4">
                  <Link href={`/scan/${scan.id}`} className="w-full">
                    <Button variant="ghost" className="w-full justify-between">
                      View Analysis <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
