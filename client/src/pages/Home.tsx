import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Camera, Bell, Shield, Zap } from "lucide-react";
import { APP_TITLE } from "@/const";
import { Link } from "wouter";

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero Section */}
      <main className="flex-1">
        <section className="bg-gradient-to-b from-green-50 to-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-5xl font-bold text-gray-900 mb-6">
              Monitor Your Birdhouse
              <br />
              <span className="text-green-600">Anywhere, Anytime</span>
            </h2>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              Stream live video from your ESP32-CAM birdhouse and receive instant motion detection alerts on your phone.
            </p>
            
            <div className="flex gap-4 justify-center">
              {user ? (
                <Button size="lg" asChild>
                  <Link href="/devices">
                    <Camera className="mr-2 h-5 w-5" />
                    View My Devices
                  </Link>
                </Button>
              ) : (
                <Button size="lg" asChild>
                  <a href="/auth/google">
                    Get Started
                  </a>
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20 bg-white">
          <div className="container mx-auto px-4">
            <h3 className="text-3xl font-bold text-center mb-12">Key Features</h3>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-600 mb-4">
                  <Camera className="h-8 w-8" />
                </div>
                <h4 className="text-xl font-semibold mb-2">Live Streaming</h4>
                <p className="text-gray-600">
                  Watch real-time video from your birdhouse via MQTT over WebSocket
                </p>
              </div>
              
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 text-blue-600 mb-4">
                  <Bell className="h-8 w-8" />
                </div>
                <h4 className="text-xl font-semibold mb-2">Motion Alerts</h4>
                <p className="text-gray-600">
                  Get instant push notifications when motion is detected by mmwave sensor
                </p>
              </div>
              
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-100 text-purple-600 mb-4">
                  <Shield className="h-8 w-8" />
                </div>
                <h4 className="text-xl font-semibold mb-2">Secure & Private</h4>
                <p className="text-gray-600">
                  Your devices and streams are private and accessible only to you
                </p>
              </div>
              
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-orange-100 text-orange-600 mb-4">
                  <Zap className="h-8 w-8" />
                </div>
                <h4 className="text-xl font-semibold mb-2">Power Efficient</h4>
                <p className="text-gray-600">
                  Streams only when viewing, automatically stops after 60 seconds
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 bg-gray-50">
          <div className="container mx-auto px-4">
            <h3 className="text-3xl font-bold text-center mb-12">How It Works</h3>
            
            <div className="max-w-3xl mx-auto space-y-8">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center font-bold">
                  1
                </div>
                <div>
                  <h4 className="text-xl font-semibold mb-2">Set Up Your ESP32-CAM</h4>
                  <p className="text-gray-600">
                    Install the provided Arduino code on your ESP32-CAM with WiFi AutoConnect and MQTT support.
                  </p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center font-bold">
                  2
                </div>
                <div>
                  <h4 className="text-xl font-semibold mb-2">Register Your Device</h4>
                  <p className="text-gray-600">
                    Add your birdhouse camera to your account using the unique device ID.
                  </p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center font-bold">
                  3
                </div>
                <div>
                  <h4 className="text-xl font-semibold mb-2">Start Watching</h4>
                  <p className="text-gray-600">
                    Open the app, tap to start streaming, and receive motion alerts on your device.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-green-600 text-white">
          <div className="container mx-auto px-4 text-center">
            <h3 className="text-3xl font-bold mb-4">Ready to Get Started?</h3>
            <p className="text-xl mb-8 opacity-90">
              Sign in now and connect your first birdhouse camera
            </p>
            {!user && (
              <Button size="lg" variant="secondary" asChild>
                <a href="/auth/google">Sign In with Google</a>
              </Button>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white py-8">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p>&copy; 2025 {APP_TITLE}. Built with ESP32-CAM, MQTT, and PWA technology.</p>
        </div>
      </footer>
    </div>
  );
}
