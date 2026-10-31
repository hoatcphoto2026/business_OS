import { IsString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Banking webhook payload – sent by bank or reconciliation service
 * when a transfer matching a VietQR content is received.
 */
export class BankingWebhookDto {
  @ApiProperty({ description: 'Transfer content / reference (matches providerRef)' })
  @IsString()
  content!: string;

  @ApiProperty({ description: 'Amount received' })
  @IsNumber()
  amount!: number;

  @ApiPropertyOptional({ description: 'Bank transaction ID' })
  @IsOptional()
  @IsString()
  bankTxnId?: string;

  @ApiProperty({ description: 'Shared secret for verification' })
  @IsString()
  signature!: string;
}
