export interface ShipmentRequest {
  deliveryOrderId: string;
  recipientName: string;
  recipientPhone?: string;
  recipientAddress: string;
  codAmount?: number;
  weight?: number;
}

export interface ShipmentResult {
  shippingNo: string;
  fee: number;
  estimatedDays?: number;
}

export interface TrackingResult {
  shippingNo: string;
  status: string;
  events: { status: string; description: string; at: string }[];
}

export interface CarrierProvider {
  code: string;
  createShipment(req: ShipmentRequest): Promise<ShipmentResult>;
  cancelShipment(shippingNo: string): Promise<{ success: boolean }>;
  trackShipment(shippingNo: string): Promise<TrackingResult>;
  calculateFee(req: Partial<ShipmentRequest>): Promise<number>;
  getStatus(shippingNo: string): Promise<string>;
}
