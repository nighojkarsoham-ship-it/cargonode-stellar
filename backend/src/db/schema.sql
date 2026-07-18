-- CargoNode Database Schema

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stellar_address VARCHAR(56) UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('shipper', 'driver')),
    name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id VARCHAR(32) UNIQUE NOT NULL,
    shipper_id UUID NOT NULL REFERENCES users(id),
    driver_id UUID NOT NULL REFERENCES users(id),
    origin VARCHAR(255) NOT NULL,
    destination VARCHAR(255) NOT NULL,
    cargo_description TEXT,
    cargo_weight_kg DECIMAL(10,2),
    amount DECIMAL(20,7) NOT NULL CHECK (amount > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'created' CHECK (status IN (
        'created',       -- Escrowed on-chain
        'accepted',      -- Driver accepted
        'in_transit',    -- Shipment in progress
        'delivered',     -- Proof of delivery uploaded
        'confirmed',     -- Shipper confirmed delivery
        'completed',     -- Payment released
        'cancelled'      -- Cancelled by shipper
    )),
    contract_address VARCHAR(56),
    tx_hash VARCHAR(64),
    proof_of_delivery_url TEXT,
    pickup_date TIMESTAMP WITH TIME ZONE,
    delivery_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipments_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID NOT NULL REFERENCES shipments(id),
    status VARCHAR(20) NOT NULL,
    tx_hash VARCHAR(64),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_shipments_shipper ON shipments(shipper_id);
CREATE INDEX idx_shipments_driver ON shipments(driver_id);
CREATE INDEX idx_shipments_status ON shipments(status);
CREATE INDEX idx_users_stellar ON users(stellar_address);
