import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  useCreateCropScan, 
  useCreateSoilData, 
  useCreateClimateData,
  useAnalyzeCropScan
} from "@workspace/api-client-react";
import { Loader2, ArrowRight, CheckCircle2 } from "lucide-react";

export default function ScanWizard() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [scanId, setScanId] = useState<number | null>(null);

  // Form states
  const [cropType, setCropType] = useState<string>("");
  const [imageUrl, setImageUrl] = useState<string>("");
  
  const [soilData, setSoilData] = useState({
    phLevel: "", moisturePercent: "", nitrogenPpm: "", phosphorusPpm: "", potassiumPpm: ""
  });
  
  const [climateData, setClimateData] = useState({
    temperatureCelsius: "", humidityPercent: "", rainfallMm: ""
  });

  const createScan = useCreateCropScan();
  const createSoil = useCreateSoilData();
  const createClimate = useCreateClimateData();
  const analyzeScan = useAnalyzeCropScan();

  const handleStep1 = async () => {
    if (!cropType) return;
    try {
      const res = await createScan.mutateAsync({ data: { cropType, imageUrl: imageUrl || undefined } });
      setScanId(res.id);
      setStep(2);
    } catch (e) {
      console.error(e);
    }
  };

  const handleStep2 = async () => {
    if (!scanId) return;
    try {
      await createSoil.mutateAsync({
        data: {
          cropScanId: scanId,
          phLevel: soilData.phLevel ? Number(soilData.phLevel) : undefined,
          moisturePercent: soilData.moisturePercent ? Number(soilData.moisturePercent) : undefined,
          nitrogenPpm: soilData.nitrogenPpm ? Number(soilData.nitrogenPpm) : undefined,
          phosphorusPpm: soilData.phosphorusPpm ? Number(soilData.phosphorusPpm) : undefined,
          potassiumPpm: soilData.potassiumPpm ? Number(soilData.potassiumPpm) : undefined,
        }
      });
      setStep(3);
    } catch (e) {
      console.error(e);
    }
  };

  const handleStep3 = async () => {
    if (!scanId) return;
    try {
      await createClimate.mutateAsync({
        data: {
          cropScanId: scanId,
          temperatureCelsius: climateData.temperatureCelsius ? Number(climateData.temperatureCelsius) : undefined,
          humidityPercent: climateData.humidityPercent ? Number(climateData.humidityPercent) : undefined,
          rainfallMm: climateData.rainfallMm ? Number(climateData.rainfallMm) : undefined,
        }
      });
      setStep(4);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAnalyze = async () => {
    if (!scanId) return;
    try {
      await analyzeScan.mutateAsync({ id: scanId });
      setLocation(`/scan/${scanId}`);
    } catch (e) {
      console.error(e);
    }
  };

  const isPending = createScan.isPending || createSoil.isPending || createClimate.isPending || analyzeScan.isPending;

  return (
    <Layout>
      <div className="p-6 sm:p-10 max-w-3xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">New Crop Analysis</h1>
          <p className="text-muted-foreground mt-2 text-lg">Follow the steps to get AI-powered insights for your crops.</p>
        </div>

        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-4">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-2 shrink-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                step === s ? "bg-primary text-primary-foreground" :
                step > s ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
              }`}>
                {step > s ? <CheckCircle2 className="w-5 h-5" /> : s}
              </div>
              <div className="text-sm font-medium whitespace-nowrap">
                {s === 1 ? "Crop Details" : s === 2 ? "Soil Data" : s === 3 ? "Climate Data" : "Analysis"}
              </div>
              {s < 4 && <div className="w-8 h-px bg-border mx-2" />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Crop Details</CardTitle>
              <CardDescription>Select the crop you want to analyze and provide an image.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Crop Type *</Label>
                <Select value={cropType} onValueChange={setCropType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a crop" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Mango">Mango</SelectItem>
                    <SelectItem value="Dragon Fruit">Dragon Fruit</SelectItem>
                    <SelectItem value="Chikoo">Chikoo (Sapota)</SelectItem>
                    <SelectItem value="Pomegranate">Pomegranate</SelectItem>
                    <SelectItem value="Mulberry">Mulberry</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Image URL (Optional)</Label>
                <Input 
                  placeholder="https://example.com/crop.jpg" 
                  value={imageUrl} 
                  onChange={(e) => setImageUrl(e.target.value)} 
                />
              </div>
            </CardContent>
            <CardFooter className="justify-end">
              <Button onClick={handleStep1} disabled={!cropType || isPending} className="w-full sm:w-auto">
                {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Next Step <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Soil Data</CardTitle>
              <CardDescription>Provide soil readings to improve recommendation accuracy.</CardDescription>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>pH Level</Label>
                <Input type="number" step="0.1" value={soilData.phLevel} onChange={(e) => setSoilData({...soilData, phLevel: e.target.value})} placeholder="e.g. 6.5" />
              </div>
              <div className="space-y-2">
                <Label>Moisture (%)</Label>
                <Input type="number" value={soilData.moisturePercent} onChange={(e) => setSoilData({...soilData, moisturePercent: e.target.value})} placeholder="e.g. 40" />
              </div>
              <div className="space-y-2">
                <Label>Nitrogen (ppm)</Label>
                <Input type="number" value={soilData.nitrogenPpm} onChange={(e) => setSoilData({...soilData, nitrogenPpm: e.target.value})} placeholder="e.g. 150" />
              </div>
              <div className="space-y-2">
                <Label>Phosphorus (ppm)</Label>
                <Input type="number" value={soilData.phosphorusPpm} onChange={(e) => setSoilData({...soilData, phosphorusPpm: e.target.value})} placeholder="e.g. 60" />
              </div>
              <div className="space-y-2">
                <Label>Potassium (ppm)</Label>
                <Input type="number" value={soilData.potassiumPpm} onChange={(e) => setSoilData({...soilData, potassiumPpm: e.target.value})} placeholder="e.g. 200" />
              </div>
            </CardContent>
            <CardFooter className="justify-end">
              <Button onClick={handleStep2} disabled={isPending} className="w-full sm:w-auto">
                {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Next Step <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Climate Data</CardTitle>
              <CardDescription>Recent weather conditions affecting the crop.</CardDescription>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Temperature (°C)</Label>
                <Input type="number" value={climateData.temperatureCelsius} onChange={(e) => setClimateData({...climateData, temperatureCelsius: e.target.value})} placeholder="e.g. 28" />
              </div>
              <div className="space-y-2">
                <Label>Humidity (%)</Label>
                <Input type="number" value={climateData.humidityPercent} onChange={(e) => setClimateData({...climateData, humidityPercent: e.target.value})} placeholder="e.g. 65" />
              </div>
              <div className="space-y-2">
                <Label>Rainfall (mm)</Label>
                <Input type="number" value={climateData.rainfallMm} onChange={(e) => setClimateData({...climateData, rainfallMm: e.target.value})} placeholder="e.g. 12" />
              </div>
            </CardContent>
            <CardFooter className="justify-end">
              <Button onClick={handleStep3} disabled={isPending} className="w-full sm:w-auto">
                {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Next Step <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === 4 && (
          <Card className="text-center py-12">
            <CardContent>
              <Brain className="w-16 h-16 mx-auto text-primary mb-6" />
              <CardTitle className="mb-2 text-2xl">Ready for AI Analysis</CardTitle>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                We've gathered all the necessary data. Our AI model will now analyze the crop type, health status, and environment to generate predictions and recommendations.
              </p>
              <Button size="lg" onClick={handleAnalyze} disabled={isPending} className="px-8 text-lg h-auto py-4">
                {isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Analyzing Data...
                  </>
                ) : (
                  "Run AI Analysis"
                )}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
