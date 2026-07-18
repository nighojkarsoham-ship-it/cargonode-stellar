"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  getShipment,
  buildAcceptTx,
  buildConfirmTx,
  buildCancelTx,
  submitSignedTx,
  Shipment,
} from "@/lib/api";
import { useFreighter } from "@/hooks/useFreighter";
import { ConnectButton } from "@/components/ConnectButton";
import { ShipmentDetailSkeleton } from "@/components/Skeleton";

const STATUS_STEPS: Record<string, number> = {
  pending: 0,
  created: 1,
  accepted: 2,
  in_transit: 3,
  delivered: 4,
  confirmed: 5,
  completed: 6,
  cancelled: -1,
};

const STEP_LABELS = ["Escrowed", "Accepted", "In Transit", "Delivered", "Confirmed", "Completed"];

const EXPLORER_BASE = process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet"
  ? "https://stellar.expert/public/tx"
  : "https://stellar.expert/testnet/tx";

export default function ShipmentDetailPage() {
  const params = useParams();
  const shipmentId = params.shipment_id as string;
  const { connected, address, sign } = useFreighter();

  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    loadShipment();
  }, [shipmentId]);

  const loadShipment = async () => {
    try {
      const data = await getShipment(shipmentId);
      setShipment(data.shipment);
    } catch (err: any) {
      console.error("Failed to load shipment:", err);
      setError(err.message || "Failed to load shipment");
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (
    action: "accept" | "confirm" | "cancel"
  ) => {
    if (!connected || !address || !shipment) return;

    setActionLoading(true);
    setStatus(null);

    try {
      let xdr: string;

      switch (action) {
        case "accept": {
          const acceptData = await buildAcceptTx(shipmentId, address);
          xdr = acceptData.xdr;
          break;
        }
        case "confirm": {
          const confirmData = await buildConfirmTx(shipmentId, address);
          xdr = confirmData.xdr;
          break;
        }
        case "cancel": {
          const cancelData = await buildCancelTx(shipmentId, address);
          xdr = cancelData.xdr;
          break;
        }
        default: {
          throw new Error(`Unknown action: ${action}`);
        }
      }

      setStatus("Please sign in your wallet...");
      const signedXdr = await sign(xdr);

      setStatus("Submitting transaction...");
      const submitStatus =
        action === "accept" ? "accepted"
        : action === "confirm" ? "confirmed"
        : "cancelled";
      await submitSignedTx(shipmentId, signedXdr, submitStatus);

      setStatus(`${action} successful!`);
      await loadShipment();
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <ShipmentDetailSkeleton />;
  }

  if (error || !shipment) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <div className="text-6xl mb-4">❌</div>
        <h2 className="text-2xl font-bold text-secondary mb-2">
          {error || "Shipment not found"}
        </h2>
        <button onClick={loadShipment} className="btn-primary mt-4">
          Try again
        </button>
      </div>
    );
  }

  const step = STATUS_STEPS[shipment.status] ?? 0;
  const isShipper = connected && address === shipment.shipper_stellar_address;
  const isDriver = connected && address === shipment.driver_stellar_address;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8">
        <div>
          <span className="font-mono text-xs sm:text-sm text-gray-500 break-all">
            {shipment.shipment_id}
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-secondary mt-1">
            {shipment.origin} → {shipment.destination}
          </h1>
        </div>
        <ConnectButton />
      </div>

      {/* Progress Steps */}
      {shipment.status !== "cancelled" && (
        <div className="card mb-8">
          {/* Desktop: horizontal */}
          <div className="hidden sm:flex justify-between items-center">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    i < step
                      ? "bg-green-500 text-white"
                      : i === step
                      ? "bg-primary text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {i < step ? "✓" : i + 1}
                </div>
                <span className="text-xs text-gray-500 mt-1">{label}</span>
              </div>
            ))}
          </div>
          {/* Mobile: vertical */}
          <div className="sm:hidden space-y-3">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className="flex items-center gap-3">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    i < step
                      ? "bg-green-500 text-white"
                      : i === step
                      ? "bg-primary text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {i < step ? "✓" : i + 1}
                </div>
                <span className={`text-sm ${i === step ? "font-medium text-secondary" : "text-gray-500"}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Details Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8">
        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Amount</h3>
          <p className="text-2xl font-bold text-primary">
            {shipment.amount} USDC
          </p>
        </div>
        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Status</h3>
          <p className="text-2xl font-bold text-secondary capitalize">
            {shipment.status.replace("_", " ")}
          </p>
        </div>
        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Origin</h3>
          <p className="text-lg font-medium">{shipment.origin}</p>
        </div>
        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Destination
          </h3>
          <p className="text-lg font-medium">{shipment.destination}</p>
        </div>
        {shipment.cargo_description && (
          <div className="card sm:col-span-2">
            <h3 className="text-sm font-medium text-gray-500 mb-2">
              Cargo Description
            </h3>
            <p className="text-lg">{shipment.cargo_description}</p>
            {shipment.cargo_weight_kg && (
              <p className="text-sm text-gray-500 mt-1">
                Weight: {shipment.cargo_weight_kg} kg
              </p>
            )}
          </div>
        )}
      </div>

      {/* Transaction Hash */}
      {shipment.tx_hash && (
        <div className="card mb-8">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Escrow Transaction
          </h3>
          <a
            href={`${EXPLORER_BASE}/${shipment.tx_hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs sm:text-sm text-primary hover:underline break-all"
          >
            {shipment.tx_hash}
          </a>
        </div>
      )}

      {/* Actions */}
      {connected && (
        <div className="card">
          <h3 className="text-lg font-semibold text-secondary mb-4">
            Actions
          </h3>

          <div className="flex gap-3 flex-wrap">
            {shipment.status === "created" && isDriver && (
              <button
                onClick={() => handleAction("accept")}
                disabled={actionLoading}
                className="btn-primary"
              >
                {actionLoading ? "Processing..." : "Accept Shipment"}
              </button>
            )}

            {shipment.status === "accepted" && isShipper && (
              <button
                onClick={() => handleAction("confirm")}
                disabled={actionLoading}
                className="btn-primary"
              >
                {actionLoading ? "Processing..." : "Confirm Delivery"}
              </button>
            )}

            {(shipment.status === "created" ||
              shipment.status === "accepted") &&
              isShipper && (
                <button
                  onClick={() => handleAction("cancel")}
                  disabled={actionLoading}
                  className="btn-danger"
                >
                  {actionLoading ? "Processing..." : "Cancel Shipment"}
                </button>
              )}
          </div>

          {status && (
            <div
              className={`mt-4 p-3 rounded-lg text-sm ${
                status.startsWith("Error")
                  ? "bg-red-50 text-red-700"
                  : "bg-blue-50 text-blue-700"
              }`}
            >
              {status}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
