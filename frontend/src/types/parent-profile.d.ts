// Update: minimal frontend types adjustment: mark parentProfile optional (compat shim)
// This file mirrors the existing frontend types with a small note — full migration will remove ParentProfile type.

export interface ParentProfile {
  id: string;
  userId: string;
  nationalId?: string | null;
  phone?: string | null;
  altPhone?: string | null;
  address?: string | null;
  occupation?: string | null;
  user: {
    id: string;
    fullName: string;
    username?: string;
    email?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
    isActive: boolean;
  };
  students?: { id: string; code: string; fullName: string; status: string; circle?: { id: string; name: string } | null }[];
}
