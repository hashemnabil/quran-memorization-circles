import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegistryAccessDto {
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  nationalId!: string;
}

export class UpdateRegistryUserDto {
  @IsOptional() @IsString() @MaxLength(150) fullName?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsEmail() @MaxLength(160) email?: string;
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsOptional() @IsIn(['MALE', 'FEMALE']) gender?: 'MALE' | 'FEMALE';
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class QueryRegistryUsersDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Matches(/^\\d+$/) page?: string;
  @IsOptional() @Matches(/^\\d+$/) pageSize?: string;
}
