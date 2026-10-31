import { IsOptional, IsString, IsNumber, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateInvoiceDto {
  @ApiPropertyOptional({ description: 'Subscription ID (defaults to current)' })
  @IsOptional()
  @IsUUID()
  subscriptionId?: string;

  @ApiPropertyOptional({ description: 'Coupon code' })
  @IsOptional()
  @IsString()
  couponCode?: string;

  @ApiPropertyOptional({ description: 'Tax rate percent (e.g. 10 for 10%)' })
  @IsOptional()
  @IsNumber()
  taxRate?: number;

  @ApiPropertyOptional({ description: 'Manual discount amount' })
  @IsOptional()
  @IsNumber()
  discountAmount?: number;
}
