import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
 title:'FangraphSavant | MLB Research Desk',
 description:'Private MLB research desk: 2015–2026 full game scorebooks, play-by-play, customizable statistics, roster depth and official Statcast splits.',
 robots:{index:false,follow:false},
 icons:{icon:'/favicon.svg'}
};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" data-theme="navy" suppressHydrationWarning><body>{children}</body></html>}
