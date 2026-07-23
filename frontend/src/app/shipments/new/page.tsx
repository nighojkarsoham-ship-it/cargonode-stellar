"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createShipment, submitSignedTx, fundAccount } from "@/lib/api";
import { useFreighter } from "@/hooks/useFreighter";
import { ConnectButton } from "@/components/ConnectButton";

function TestTokenFunder({ address }: { address: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFund = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fundAccount(address);
      const parts = [];
      if (res.xlm_funded) parts.push("XLM funded");
      if (res.tokens_minted) parts.push(`${res.token_amount} test USDC minted`);
      if (!res.tokens_minted && res.xlm_funded) parts.push("test tokens not available");
      setResult(parts.join(" — "));
    } catch (err: any) {
      setError(err.message || "Funding failed");
    } finally {
      setLoading(false);
    }
  };

  if (result && !error) {
    return (
      <div className="mb-6 p-4 rounded-lg bg-green-50 border border-green-200">
        <div className="flex items-center justify-between">
          <p className="text-sm text-green-700">{result}</p>
          <button onClick={handleFund} disabled={loading} className="text-xs text-green-600 underline hover:text-green-800">
            Fund again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 p-4 rounded-lg bg-yellow-50 border border-yellow-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-yellow-800">Need test tokens?</p>
          <p className="text-xs text-yellow-600">Get free XLM + 100 test USDC for this address</p>
        </div>
        <button
          onClick={handleFund}
          disabled={loading}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-50"
        >
          {loading ? "Funding..." : "Get Test Tokens"}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}

export default function NewShipmentPage() {
  const router = useRouter();
  const { connected, address, sign, installed } = useFreighter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    driver_address: "",
    amount: "",
    origin: "",
    destination: "",
    cargo_description: "",
    cargo_weight_kg: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected || !address) return;

    setLoading(true);
    setStatus("Creating shipment...");
    setSuccess(false);

    try {
      // Step 1: Create shipment via API
      const data = await createShipment({
        shipper_address: address,
        driver_address: form.driver_address,
        amount: form.amount,
        origin: form.origin,
        destination: form.destination,
        cargo_description: form.cargo_description || undefined,
        cargo_weight_kg: form.cargo_weight_kg
          ? parseFloat(form.cargo_weight_kg)
          : undefined,
      });

      setStatus("Please sign the transaction in your wallet...");

      // Step 2: Sign XDR with Freighter (skip if dev mode)
      let txHash: string | null = null;
      if (data.xdr) {
        const signedXdr = await sign(data.xdr);

        setStatus("Submitting transaction to Stellar...");

        // Step 3: Submit signed transaction
        const result = await submitSignedTx(data.shipment_id, signedXdr, "created");
        txHash = result.tx_hash;
        setStatus(`Shipment created! Tx: ${txHash.slice(0, 12)}...`);
      } else {
        setStatus("Shipment created! (Dev mode — contract not deployed)");
      }

      setSuccess(true);

      // Redirect only on success
      setTimeout(() => {
        router.push(`/shipments/${data.shipment_id}`);
      }, 2000);
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  const updateForm = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  if (!connected) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="text-6xl mb-4">🔗</div>
        <h2 className="text-2xl font-bold text-secondary mb-4">
          Connect Your Wallet
        </h2>
        <p className="text-gray-600 mb-6">
          {installed
            ? "Connect your Stellar wallet to create a shipment"
            : "Install Freighter wallet extension to get started"}
        </p>
        <ConnectButton />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Fund Test Tokens */}
      {address && <TestTokenFunder address={address} />}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-secondary">New Shipment</h1>
        <p className="text-gray-600 mt-1">
          Create a shipment and lock payment in escrow
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Origin & Destination */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Origin</label>
            <input
              type="text"
              className="input"
              placeholder="New York, NY"
              value={form.origin}
              onChange={(e) => updateForm("origin", e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Destination</label>
            <input
              type="text"
              className="input"
              placeholder="Los Angeles, CA"
              value={form.destination}
              onChange={(e) => updateForm("destination", e.target.value)}
              required
            />
          </div>
        </div>

        {/* Driver Address */}
        <div>
          <label className="label">Driver Stellar Address</label>
          <input
            type="text"
            className="input font-mono text-sm"
            placeholder="G..."
            value={form.driver_address}
            onChange={(e) => updateForm("driver_address", e.target.value)}
            required
          />
        </div>

        {/* Amount */}
        <div>
          <label className="label">Payment Amount (USDC)</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            className="input"
            placeholder="100.00"
            value={form.amount}
            onChange={(e) => updateForm("amount", e.target.value)}
            required
          />
        </div>

        {/* Cargo Details */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Cargo Description</label>
            <input
              type="text"
              className="input"
              placeholder="Electronics, furniture..."
              value={form.cargo_description}
              onChange={(e) => updateForm("cargo_description", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Weight (kg)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              className="input"
              placeholder="500"
              value={form.cargo_weight_kg}
              onChange={(e) => updateForm("cargo_weight_kg", e.target.value)}
            />
          </div>
        </div>

        {/* Submit */}
        <div className="pt-4">
          <button
            type="submit"
            disabled={loading || !connected}
            className="btn-primary w-full"
          >
            {loading ? "Processing..." : "Create & Fund Escrow"}
          </button>
        </div>

        {/* Status */}
        {status && (
          <div
            className={`p-4 rounded-lg text-sm ${
              status.startsWith("Error")
                ? "bg-red-50 text-red-700"
                : "bg-blue-50 text-blue-700"
            }`}
          >
            {status}
            {success && (
              <p className="text-xs mt-1 text-green-600">
                Redirecting to shipment details...
              </p>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
