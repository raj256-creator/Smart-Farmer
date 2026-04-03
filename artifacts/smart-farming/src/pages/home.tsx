import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Leaf, ScanLine, Brain, Droplets } from "lucide-react";
import { Layout } from "@/components/layout";

export default function Home() {
  return (
    <Layout>
      <div className="flex-1 flex flex-col">
        <section className="bg-primary text-primary-foreground py-20 px-6 sm:px-12 relative overflow-hidden">
          <div className="max-w-4xl mx-auto relative z-10">
            <h1 className="text-4xl sm:text-6xl font-bold mb-6 tracking-tight">
              Professional Agronomy <br /> in Your Pocket
            </h1>
            <p className="text-lg sm:text-xl opacity-90 mb-10 max-w-2xl">
              Monitor Mango, Dragon Fruit, Chikoo, Pomegranate, and Mulberry with precision.
              Detect diseases early, predict yields, and optimize your harvest with AI.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link href="/scan/new">
                <Button size="lg" variant="secondary" className="text-lg px-8 py-6 h-auto font-semibold">
                  Start a Scan
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button size="lg" variant="outline" className="text-lg px-8 py-6 h-auto bg-transparent border-primary-foreground/20 hover:bg-primary-foreground/10 text-primary-foreground">
                  View Dashboard
                </Button>
              </Link>
            </div>
          </div>
          {/* Decorative background elements */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary-foreground/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-20 w-64 h-64 bg-primary-foreground/10 rounded-full blur-2xl translate-y-1/2" />
        </section>

        <section className="py-20 px-6 sm:px-12 bg-background flex-1">
          <div className="max-w-6xl mx-auto">
            <div className="grid sm:grid-cols-3 gap-8">
              <div className="p-6 rounded-2xl bg-card border border-border shadow-sm">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary mb-6">
                  <ScanLine className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Crop Identification</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Upload an image of your crop and our AI instantly identifies the species and spots any early signs of disease.
                </p>
              </div>
              <div className="p-6 rounded-2xl bg-card border border-border shadow-sm">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary mb-6">
                  <Droplets className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Soil & Climate Context</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Combine visual data with soil health and local climate metrics to get highly accurate recommendations.
                </p>
              </div>
              <div className="p-6 rounded-2xl bg-card border border-border shadow-sm">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary mb-6">
                  <Brain className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">AI Recommendations</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Get actionable steps for fertilizing, watering, and harvesting to maximize your yield and protect your crops.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
