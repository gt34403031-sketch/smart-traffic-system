import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    project: 'Intelligent Smart City Traffic Management System',
    version: '1.0.0',
    degree: 'MCA Project',
    algorithms: [
      {
        name: 'Greedy Max-Pressure',
        role: 'Phase priority selection',
        features: ['Upstream/Downstream differential', 'Starvation prevention bonus', 'Spillback mitigation'],
      },
      {
        name: 'Finite-Horizon Dynamic Programming',
        role: 'Optimal green duration calculation',
        features: ['Memoization caching', 'Multi-stage delay minimization', '30-second heavy traffic minimum rule'],
      },
      {
        name: 'Hybrid Controller',
        role: 'Integrated signal orchestration',
        features: ['Emergency vehicle preemption', 'Green wave coordination', 'NEMA safety clearance'],
      },
    ],
    status: 'ONLINE',
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return NextResponse.json({
      success: true,
      receivedAt: new Date().toISOString(),
      action: body.action || 'SYNCHRONIZE_STATE',
      status: 'ACKNOWLEDGED',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
