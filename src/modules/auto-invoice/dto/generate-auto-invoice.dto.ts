import { IsEnum, IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceTrigger } from '../enums/auto-invoice.enum';

export class GenerateAutoInvoiceDto {
  @ApiProperty({ enum: InvoiceTrigger })
  @IsEnum(InvoiceTrigger)
  trigger!: InvoiceTrigger;

  @ApiPropertyOptional({ example: 'WELCOME10' })
  @IsOptional()
  @IsString()
  couponCode?: string;

  @ApiPropertyOptional({ example: 10, description: 'Discount percent' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercent?: number;

  @ApiPropertyOptional({ example: 10, description: 'Tax percent' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxPercent?: number;
}
