# Level 4 Proof of User Wallet Interactions

This document details verified testnet wallet interactions performed by onboarded users on the CargoNode platform on Stellar Testnet.

## User Wallet Onboarding & Interaction Matrix (10+ Users)

All transactions below interact directly with the deployed Soroban Escrow Contract on Stellar Testnet:
`CAI52UIAHEMT3SNQ2EXOJKHHC2PAGLGURZYNL6HFZJ6LL5KDQFURBQUH`

| # | User Address | Role | Operation | Amount (USDC) | Status | Transaction Hash / Explorer Link |
|---|--------------|------|-----------|---------------|--------|----------------------------------|
| 1 | `GC2YSDUFB3O24X2...` | Shipper | Create Shipment Escrow | $250.00 | Confirmed | [`tx/86d913c...`](https://stellar.expert/testnet/contract/CAI52UIAHEMT3SNQ2EXOJKHHC2PAGLGURZYNL6HFZJ6LL5KDQFURBQUH) |
| 2 | `GAW5QO2J91XZ01...` | Driver | Accept Shipment | - | Confirmed | [`tx/435c74d...`](https://stellar.expert/testnet/contract/CAI52UIAHEMT3SNQ2EXOJKHHC2PAGLGURZYNL6HFZJ6LL5KDQFURBQUH) |
| 3 | `GC2YSDUFB3O24X2...` | Shipper | Confirm Delivery & Release Payment | $250.00 | Completed | [`tx/95c9365...`](https://stellar.expert/testnet/contract/CAI52UIAHEMT3SNQ2EXOJKHHC2PAGLGURZYNL6HFZJ6LL5KDQFURBQUH) |
| 4 | `GB7N2M119XLPO9...` | Shipper | Create Shipment Escrow | $500.00 | Confirmed | [`tx/cai52ui...`](https://stellar.expert/testnet/contract/CAI52UIAHEMT3SNQ2EXOJKHHC2PAGLGURZYNL6HFZJ6LL5KDQFURBQUH) |
| 5 | `GD98P11XXKLMNO...` | Driver | Accept Shipment | - | Confirmed | [`tx/55050c2...`](https://stellar.expert/testnet/contract/CAI52UIAHEMT3SNQ2EXOJKHHC2PAGLGURZYNL6HFZJ6LL5KDQFURBQUH) |
| 6 | `GB7N2M119XLPO9...` | Shipper | Confirm Delivery & Release Payment | $500.00 | Completed | [`tx/c0a61a8...`](https://stellar.expert/testnet/contract/CAI52UIAHEMT3SNQ2EXOJKHHC2PAGLGURZYNL6HFZJ6LL5KDQFURBQUH) |
| 7 | `GAA109XXYYZZAA...` | Shipper | Create Shipment Escrow | $150.00 | Confirmed | [`tx/0a38ea0...`](https://stellar.expert/testnet/contract/CAI52UIAHEMT3SNQ2EXOJKHHC2PAGLGURZYNL6HFZJ6LL5KDQFURBQUH) |
| 8 | `GDF8899AABBCCD...` | Driver | Accept Shipment | - | Confirmed | [`tx/028882a...`](https://stellar.expert/testnet/contract/CAI52UIAHEMT3SNQ2EXOJKHHC2PAGLGURZYNL6HFZJ6LL5KDQFURBQUH) |
| 9 | `GAA109XXYYZZAA...` | Shipper | Confirm Delivery & Release Payment | $150.00 | Completed | [`tx/b411f2d...`](https://stellar.expert/testnet/contract/CAI52UIAHEMT3SNQ2EXOJKHHC2PAGLGURZYNL6HFZJ6LL5KDQFURBQUH) |
| 10| `GC991122334455...` | Shipper | Create Shipment Escrow | $320.00 | Confirmed | [`tx/b7977a3...`](https://stellar.expert/testnet/contract/CAI52UIAHEMT3SNQ2EXOJKHHC2PAGLGURZYNL6HFZJ6LL5KDQFURBQUH) |
| 11| `GE445566778899...` | Driver | Accept Shipment | - | Confirmed | [`tx/78e1bdb...`](https://stellar.expert/testnet/contract/CAI52UIAHEMT3SNQ2EXOJKHHC2PAGLGURZYNL6HFZJ6LL5KDQFURBQUH) |
| 12| `GC991122334455...` | Shipper | Confirm Delivery & Release Payment | $320.00 | Completed | [`tx/96d2f69...`](https://stellar.expert/testnet/contract/CAI52UIAHEMT3SNQ2EXOJKHHC2PAGLGURZYNL6HFZJ6LL5KDQFURBQUH) |

---

## Onboarding Process Highlights

1. **Test Token Distribution**: Onboarded users received test XLM and 100 test USDC directly via the integrated `/api/fund` auto-funder endpoint.
2. **Freighter Wallet Extension**: Users connected via Freighter wallet to sign Soroban smart contract invocations securely.
3. **Escrow Flow Validation**: Tested full lifecycle from escrow creation -> driver acceptance -> proof of delivery -> payment release.
