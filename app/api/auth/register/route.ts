import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import OTP from '@/models/OTP';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
    await dbConnect();
    const { name, email, phone, password, role, otp } = await req.json();

    // 1. Check if user exists
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
        return NextResponse.json({ message: 'User with this email or phone already exists' }, { status: 400 });
    }

    // 2. Verify OTP
    const otpRecord = await OTP.findOne({ phone });
    if (!otpRecord || otpRecord.otp !== otp) {
        return NextResponse.json({ message: 'Invalid or expired OTP' }, { status: 400 });
    }

    // 3. Hash Password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Generate Custom IDs
    // Use timestamp to ensure uniqueness and avoid race conditions/collisions
    const timestamp = Date.now();
    const userId = `user_${timestamp}`;
    let companyId = undefined;

    if (role === 'client') {
        companyId = `company_${timestamp}`;
    }

    // 5. Create User
    const user = await User.create({
        name,
        email,
        phone,
        password: hashedPassword,
        role,
        userId,
        companyId
    });

    // 6. Delete OTP
    await OTP.deleteOne({ phone });

    return NextResponse.json({
        message: 'User registered successfully',
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            userId: user.userId,
            companyId: user.companyId
        }
    });
}
