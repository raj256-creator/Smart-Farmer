import { useRoute } from "wouter";
import { Layout } from "@/components/layout";
import { useGetCropScan, getGetCropScanQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Calendar, Scale, Leaf, ThermometerSun, Droplets } from "lucide-react";
import { format } from "date-fns";

export default function ScanDetail() {
  const [, params] = useRoute("/scan/:id");
  const id = Number(params?.id);

  const { data: scan, isLoading } = useGetCropScan(id, {
    query: {
      enabled: !!id,
      queryKey: getGetCropScanQueryKey(id)
    }
  });

  if (isLoading || !scan) {
    return (
      <Layout>
        <div className="p-6 max-w-5xl mx-auto w-full space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid md:grid-cols-3 gap-6">
            <Skeleton className="h-64 col-span-2" />
            <Skeleton className="h-64 col-span-1" />
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 sm:p-10 max-w-6xl mx-auto w-full space-y-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold tracking-tight">{scan.cropType || "Unknown Crop"}</h1>
              <Badge variant={scan.healthStatus === "Healthy" ? "default" : scan.healthStatus === "Diseased" ? "destructive" : "secondary"} className="text-sm px-3">
                {scan.healthStatus || "Pending"}
              </Badge>
            </div>
            <p className="text-muted-foreground">Scanned on {format(new Date(scan.createdAt), 'MMMM d, yyyy')}</p>
          </div>
          {scan.confidence && (
            <div className="bg-secondary px-4 py-2 rounded-lg text-sm font-medium border border-border">
              AI Confidence: <span className="text-primary font-bold">{(scan.confidence * 100).toFixed(0)}%</span>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            {scan.imageUrl && (
              <Card className="overflow-hidden border-none shadow-md">
                <img src={scan.imageUrl} alt="Crop Scan" className="w-full h-80 object-cover" />
              </Card>
            )}
            
            <Card>
              <CardHeader>
                <CardTitle>AI Analysis Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground leading-relaxed whitespace-pre-line">{scan.analysisNotes || "No detailed notes available."}</p>
                
                {scan.diseaseDetected && (
                  <div className="mt-6 p-4 bg-destructive/10 rounded-xl border border-destructive/20 flex gap-4">
                    <AlertTriangle className="w-6 h-6 text-destructive shrink-0" />
                    <div>
                      <h4 className="font-bold text-destructive mb-1">Disease Detected</h4>
                      <p className="text-sm text-destructive/90">{scan.diseaseDetected}</p>
                    </div>
                  </div>
                )}
                
                {scan.nutrientDeficiency && (
                  <div className="mt-4 p-4 bg-amber-500/10 rounded-xl border border-amber-500/20 flex gap-4">
                    <Leaf className="w-6 h-6 text-amber-600 shrink-0" />
                    <div>
                      <h4 className="font-bold text-amber-700 mb-1">Nutrient Deficiency</h4>
                      <p className="text-sm text-amber-700/90">{scan.nutrientDeficiency}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Harvest Projections</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-secondary rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    <Scale className="w-5 h-5 text-primary" />
                    <span className="font-medium">Est. Yield</span>
                  </div>
                  <span className="font-bold text-lg">{scan.yieldPredictionKg ? `${scan.yieldPredictionKg} kg` : '--'}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-secondary rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-primary" />
                    <span className="font-medium">Days to Harvest</span>
                  </div>
                  <span className="font-bold text-lg">{scan.harvestDaysRemaining || '--'}</span>
                </div>
                {scan.harvestWindow && (
                  <div className="pt-2 text-sm text-muted-foreground">
                    <strong className="text-foreground block mb-1">Harvest Window:</strong>
                    {scan.harvestWindow}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Crop Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center border-b border-border pb-3">
                  <span className="text-muted-foreground text-sm">Growth Stage</span>
                  <span className="font-medium">{scan.growthStage || '--'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-border pb-3">
                  <span className="text-muted-foreground text-sm">Status</span>
                  <span className="font-medium">{scan.healthStatus || '--'}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
