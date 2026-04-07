import { useState, useRef, useCallback } from "react";
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
import { Loader2, ArrowRight, CheckCircle2, Brain, UploadCloud, X, ImageIcon } from "lucide-react";

export default function ScanWizard() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [scanId, setScanId] = useState<number | null>(null);

  // Form states
  const [cropType, setCropType] = useState<string>("");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [imagePreview, setImagePreview] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      setImageUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const clearImage = () => {
    setImagePreview("");
    setImageUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  
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

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const advanceTo = (next: number) => {
    setStep(next);
    setMaxStep((m) => Math.max(m, next));
  };

  const handleStep1 = async () => {
    if (!cropType) return;
    // If we already created the scan (user went back), just advance
    if (scanId) { advanceTo(2); return; }
    try {
      const res = await createScan.mutateAsync({ data: { cropType, imageUrl: imageUrl || undefined } });
      setScanId(res.id);
      advanceTo(2);
    } catch (e) {
      console.error(e);
    }
  };

  const handleStep2 = async () => {
    if (!scanId) return;
    // If user went back and is re-submitting, just advance without duplicate insert
    if (maxStep > 2) { advanceTo(3); return; }
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
      advanceTo(3);
    } catch (e) {
      console.error(e);
    }
  };

  const handleStep3 = async () => {
    if (!scanId) return;
    // If user went back and is re-submitting, just advance without duplicate insert
    if (maxStep > 3) { advanceTo(4); return; }
    try {
      await createClimate.mutateAsync({
        data: {
          cropScanId: scanId,
          temperatureCelsius: climateData.temperatureCelsius ? Number(climateData.temperatureCelsius) : undefined,
          humidityPercent: climateData.humidityPercent ? Number(climateData.humidityPercent) : undefined,
          rainfallMm: climateData.rainfallMm ? Number(climateData.rainfallMm) : undefined,
        }
      });
      advanceTo(4);
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
          {[1, 2, 3, 4].map((s) => {
            const label = s === 1 ? "Crop Details" : s === 2 ? "Soil Data" : s === 3 ? "Climate Data" : "Analysis";
            const isCompleted = step > s;
            const isCurrent = step === s;
            const isClickable = s <= maxStep && s !== step;
            return (
              <div key={s} className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => isClickable ? setStep(s) : undefined}
                  disabled={!isClickable}
                  className={`flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors ${isClickable ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                  data-testid={`step-indicator-${s}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${
                    isCurrent ? "bg-primary text-primary-foreground" :
                    isCompleted ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                  }`}>
                    {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : s}
                  </div>
                  <div className={`text-sm font-medium whitespace-nowrap ${isCurrent ? "text-foreground" : isCompleted ? "text-primary" : "text-muted-foreground"}`}>
                    {label}
                  </div>
                </button>
                {s < 4 && <div className="w-8 h-px bg-border mx-2 shrink-0" />}
              </div>
            );
          })}
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
                <Label>Crop Image (Optional)</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileInputChange}
                  data-testid="input-crop-image"
                />
                {imagePreview ? (
                  <div className="relative rounded-lg overflow-hidden border border-border aspect-video w-full">
                    <img
                      src={imagePreview}
                      alt="Crop preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={clearImage}
                      className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
                      data-testid="button-clear-image"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleFileDrop}
                    className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors py-10 px-4 ${
                      isDragOver
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-muted/50"
                    }`}
                    data-testid="button-upload-image"
                  >
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      {isDragOver ? (
                        <ImageIcon className="w-6 h-6 text-primary" />
                      ) : (
                        <UploadCloud className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">
                        {isDragOver ? "Drop image here" : "Click to upload or drag and drop"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WEBP up to 10MB</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="justify-end">
              <Button onClick={handleStep1} disabled={!cropType || isPending} className="w-full sm:w-auto" data-testid="button-step1-next">
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
            <CardFooter className="flex justify-between gap-3">
              <Button variant="outline" onClick={goBack} disabled={isPending} data-testid="button-step2-back">
                Back
              </Button>
              <Button onClick={handleStep2} disabled={isPending} className="w-full sm:w-auto" data-testid="button-step2-next">
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
            <CardFooter className="flex justify-between gap-3">
              <Button variant="outline" onClick={goBack} disabled={isPending} data-testid="button-step3-back">
                Back
              </Button>
              <Button onClick={handleStep3} disabled={isPending} className="w-full sm:w-auto" data-testid="button-step3-next">
                {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Next Step <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === 4 && (
          <Card>
            <CardContent className="text-center py-12">
              <Brain className="w-16 h-16 mx-auto text-primary mb-6" />
              <CardTitle className="mb-2 text-2xl">Ready for AI Analysis</CardTitle>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                We've gathered all the necessary data. Our AI model will now analyze the crop type, health status, and environment to generate predictions and recommendations.
              </p>
              <Button size="lg" onClick={handleAnalyze} disabled={isPending} className="px-8 text-lg h-auto py-4" data-testid="button-run-analysis">
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
            <CardFooter className="justify-start border-t pt-4">
              <Button variant="outline" onClick={goBack} disabled={isPending} data-testid="button-step4-back">
                Back
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </Layout>
  );
}
