"use client";

import { useState } from "react";
import { SshTerminalModal } from "@/components/ssh-terminal-modal";

type SshTerminalWrapperProps = {
 serverId: string;
 serverName: string;
 host: string;
 port: number;
 sessionToken: string;
 children: (onSshConnect: () => void) => React.ReactNode;
};

export function SshTerminalWrapper({ serverId, serverName, host, port, sessionToken, children }: SshTerminalWrapperProps) {
  const [showTerminal, setShowTerminal] = useState(false);

  return (
    <>
      {children(() => setShowTerminal(true))}
      {showTerminal && (
 <SshTerminalModal
 serverId={serverId}
 serverName={serverName}
 host={`${host}:${port}`}
 sessionToken={sessionToken}
 onClose={() => setShowTerminal(false)}
        />
      )}
    </>
  );
}
