import { Injectable } from '@nestjs/common';
import { CarrierProvider, ShipmentRequest, ShipmentResult, TrackingResult } from './carrier-provider.interface';

@Injectable()
export class MockCarrierProvider implements CarrierProvider {
  code = 'MOCK';

  async createShipment(_req: ShipmentRequest): Promise<ShipmentResult> {
    const shippingNo = `MOCK${Date.now().toString(36).toUpperCase()}`;
    return { shippingNo, fee: 25000, estimatedDays: 2 };
  }

  async cancelShipment(_shippingNo: string) {
    return { success: true };
  }

  async trackShipment(shippingNo: string): Promise<TrackingResult> {
    return {
      shippingNo,
      status: 'IN_TRANSIT',
      events: [
        { status: 'CREATED', description: 'Order created', at: new Date().toISOString() },
        { status: 'PICKED_UP', description: 'Picked up by carrier', at: new Date().toISOString() },
        { status: 'IN_TRANSIT', description: 'In transit', at: new Date().toISOString() },
      ],
    };
  }

  async calculateFee(_req: Partial<ShipmentRequest>) {
    return 25000;
  }

  async getStatus(_shippingNo: string) {
    return 'IN_TRANSIT';
  }
}
