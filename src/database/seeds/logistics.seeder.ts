import { DataSource } from 'typeorm';
import { Carrier } from '../../modules/logistics/entities/carrier.entity';
import { DeliveryOrder } from '../../modules/logistics/entities/delivery-order.entity';
import { DeliveryTrackingEvent } from '../../modules/logistics/entities/delivery-tracking-event.entity';
import { CodSettlement } from '../../modules/logistics/entities/cod-settlement.entity';
import { DeliveryStatus } from '../../modules/logistics/enums/delivery-status.enum';
import { Tenant } from '../../modules/tenant/entities/tenant.entity';
import { User } from '../../modules/users/entities/user.entity';

const CARRIERS = [
  { code: 'GHN', name: 'Giao Hàng Nhanh' },
  { code: 'GHTK', name: 'Giao Hàng Tiết Kiệm' },
  { code: 'VTP', name: 'Viettel Post' },
  { code: 'JNT', name: 'J&T Express' },
];

interface DemoShipment {
  shippingNo: string;
  carrierCode: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  shippingFee: number;
  codAmount: number;
  status: DeliveryStatus;
  notes?: string;
  events: Array<{ status: DeliveryStatus; description: string; location?: string; hoursAgo: number }>;
  codStatus?: 'pending' | 'settled';
}

const SHIPMENTS: DemoShipment[] = [
  {
    shippingNo: 'GHN-ABC-001',
    carrierCode: 'GHN',
    recipientName: 'Nguyễn Văn An',
    recipientPhone: '0901234567',
    recipientAddress: '123 Lê Lợi, Quận 1, TP.HCM',
    shippingFee: 25000,
    codAmount: 1500000,
    status: DeliveryStatus.IN_TRANSIT,
    notes: 'Giao trong giờ hành chính',
    events: [
      { status: DeliveryStatus.CREATED, description: 'Đơn hàng được tạo', location: 'Kho ABC HCM', hoursAgo: 48 },
      { status: DeliveryStatus.ASSIGNED, description: 'Đã gán GHN', location: 'Kho ABC HCM', hoursAgo: 46 },
      { status: DeliveryStatus.PICKED_UP, description: 'Shipper đã lấy hàng', location: 'Quận 1, TP.HCM', hoursAgo: 24 },
      { status: DeliveryStatus.IN_TRANSIT, description: 'Đang vận chuyển đến điểm giao', location: 'Hub GHN Bình Thạnh', hoursAgo: 6 },
    ],
    codStatus: 'pending',
  },
  {
    shippingNo: 'GHTK-ABC-002',
    carrierCode: 'GHTK',
    recipientName: 'Trần Thị Bình',
    recipientPhone: '0912345678',
    recipientAddress: '45 Nguyễn Huệ, Quận 1, TP.HCM',
    shippingFee: 20000,
    codAmount: 850000,
    status: DeliveryStatus.DELIVERED,
    events: [
      { status: DeliveryStatus.CREATED, description: 'Đơn hàng được tạo', location: 'Kho ABC HCM', hoursAgo: 72 },
      { status: DeliveryStatus.ASSIGNED, description: 'Đã gán GHTK', location: 'Kho ABC HCM', hoursAgo: 70 },
      { status: DeliveryStatus.PICKED_UP, description: 'Đã lấy hàng', location: 'Quận 1', hoursAgo: 48 },
      { status: DeliveryStatus.IN_TRANSIT, description: 'Đang giao', location: 'Quận 1', hoursAgo: 30 },
      { status: DeliveryStatus.DELIVERED, description: 'Giao thành công – người nhận ký nhận', location: '45 Nguyễn Huệ', hoursAgo: 20 },
    ],
    codStatus: 'settled',
  },
  {
    shippingNo: 'VTP-ABC-003',
    carrierCode: 'VTP',
    recipientName: 'Lê Minh Cường',
    recipientPhone: '0987654321',
    recipientAddress: '78 Hai Bà Trưng, Hoàn Kiếm, Hà Nội',
    shippingFee: 35000,
    codAmount: 2200000,
    status: DeliveryStatus.PICKED_UP,
    events: [
      { status: DeliveryStatus.CREATED, description: 'Đơn hàng được tạo', location: 'Kho ABC HN', hoursAgo: 12 },
      { status: DeliveryStatus.ASSIGNED, description: 'Đã gán Viettel Post', location: 'Kho ABC HN', hoursAgo: 10 },
      { status: DeliveryStatus.PICKED_UP, description: 'Bưu tá đã nhận hàng', location: 'Hoàn Kiếm, Hà Nội', hoursAgo: 2 },
    ],
    codStatus: 'pending',
  },
  {
    shippingNo: 'JNT-ABC-004',
    carrierCode: 'JNT',
    recipientName: 'Phạm Thu Dung',
    recipientPhone: '0933445566',
    recipientAddress: '12 Trần Phú, Hải Châu, Đà Nẵng',
    shippingFee: 30000,
    codAmount: 0,
    status: DeliveryStatus.FAILED,
    notes: 'Khách không nghe máy',
    events: [
      { status: DeliveryStatus.CREATED, description: 'Đơn hàng được tạo', location: 'Kho ABC HCM', hoursAgo: 96 },
      { status: DeliveryStatus.ASSIGNED, description: 'Đã gán J&T', location: 'Kho ABC HCM', hoursAgo: 94 },
      { status: DeliveryStatus.PICKED_UP, description: 'Đã lấy hàng', location: 'TP.HCM', hoursAgo: 72 },
      { status: DeliveryStatus.IN_TRANSIT, description: 'Đang chuyển đến Đà Nẵng', location: 'Hub Đà Nẵng', hoursAgo: 36 },
      { status: DeliveryStatus.FAILED, description: 'Giao thất bại – không liên lạc được', location: '12 Trần Phú, Đà Nẵng', hoursAgo: 8 },
    ],
  },
  {
    shippingNo: 'GHN-ABC-005',
    carrierCode: 'GHN',
    recipientName: 'Hoàng Văn Em',
    recipientPhone: '0977889900',
    recipientAddress: '99 Cách Mạng Tháng 8, Quận 3, TP.HCM',
    shippingFee: 22000,
    codAmount: 450000,
    status: DeliveryStatus.CREATED,
    events: [
      { status: DeliveryStatus.CREATED, description: 'Đơn hàng mới tạo, chờ gán carrier', location: 'Kho ABC HCM', hoursAgo: 1 },
    ],
    codStatus: 'pending',
  },
];

export async function seedLogistics(dataSource: DataSource): Promise<void> {
  const carrierRepo = dataSource.getRepository(Carrier);
  const orderRepo = dataSource.getRepository(DeliveryOrder);
  const eventRepo = dataSource.getRepository(DeliveryTrackingEvent);
  const codRepo = dataSource.getRepository(CodSettlement);
  const tenantRepo = dataSource.getRepository(Tenant);
  const userRepo = dataSource.getRepository(User);

  // ─── Carriers (global) ───────────────────────────────────────
  for (const c of CARRIERS) {
    const exists = await carrierRepo.findOne({ where: { code: c.code } });
    if (!exists) {
      await carrierRepo.save(carrierRepo.create({ ...c, status: 'active' }));
    }
  }

  const tenant = await tenantRepo.findOne({ where: { code: 'ABC' } });
  if (!tenant) {
    console.log('   Logistics seed skipped – tenant ABC not found');
    return;
  }

  const admin = await userRepo.findOne({ where: { email: 'admin@abctrading.vn' } });
  const createdBy = admin?.id ?? null;

  // ─── Shipments + tracking + COD ──────────────────────────────
  for (const s of SHIPMENTS) {
    let order = await orderRepo.findOne({
      where: { tenantId: tenant.id, shippingNo: s.shippingNo },
    });

    if (!order) {
      order = await orderRepo.save(
        orderRepo.create({
          tenantId: tenant.id,
          shippingNo: s.shippingNo,
          carrierCode: s.carrierCode,
          recipientName: s.recipientName,
          recipientPhone: s.recipientPhone,
          recipientAddress: s.recipientAddress,
          shippingFee: s.shippingFee,
          codAmount: s.codAmount,
          status: s.status,
          notes: s.notes ?? null,
          createdBy,
          updatedBy: createdBy,
        }),
      );
    }

    // Tracking events (idempotent by status + order)
    for (const ev of s.events) {
      const exists = await eventRepo.findOne({
        where: { deliveryOrderId: order.id, status: ev.status },
      });
      if (!exists) {
        const createdAt = new Date(Date.now() - ev.hoursAgo * 60 * 60 * 1000);
        await eventRepo.save(
          eventRepo.create({
            tenantId: tenant.id,
            deliveryOrderId: order.id,
            status: ev.status,
            description: ev.description,
            location: ev.location ?? null,
            createdBy,
            createdAt,
          }),
        );
      }
    }

    // COD settlement
    if (s.codAmount > 0 && s.codStatus) {
      const codExists = await codRepo.findOne({
        where: { deliveryOrderId: order.id },
      });
      if (!codExists) {
        await codRepo.save(
          codRepo.create({
            tenantId: tenant.id,
            deliveryOrderId: order.id,
            carrier: s.carrierCode,
            codAmount: s.codAmount,
            settlementDate: s.codStatus === 'settled' ? new Date().toISOString().slice(0, 10) : null,
            status: s.codStatus,
            createdBy,
          }),
        );
      }
    }
  }

  console.log('   Logistics seeded: 4 carriers, 5 shipments (GHN-ABC-001 … GHN-ABC-005)');
}
