import { useState } from "react";
import { Layout } from "@/components/layout";
import { useListCropScans, getListCropScansQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { format } from "date-fns";
import { Search, ArrowRight, Activity, Leaf } from "lucide-react";

export default function History() {
  const [filter, setFilter] = useState("");
  
  const { data: scans, isLoading } = useListCropScans({}, {
    query: {
      queryKey: getListCropScansQueryKey({})
    }
  });

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
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Filter by crop type..." 
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9"
            />
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
