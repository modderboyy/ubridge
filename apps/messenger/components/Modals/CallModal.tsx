"use client";
import { useEffect, useRef } from "react";
import UIcon from "../UIcon";

interface CallModalProps {
  isOpen: boolean;
  isIncoming: boolean;
  isVideo: boolean;
  callerName: string;
  status: string;
  duration: string;
  micMuted: boolean;
  videoEnabled: boolean;
  speakerMuted: boolean;
  onToggleMic: () => void;
  onToggleVideo: () => void;
  onToggleSpeaker: () => void;
  onAnswer: () => void;
  onReject: () => void;
  onEnd: () => void;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  t: any;
}

export function CallModal({
  isOpen,
  isIncoming,
  isVideo,
  callerName,
  status,
  duration,
  micMuted,
  videoEnabled,
  speakerMuted,
  onToggleMic,
  onToggleVideo,
  onToggleSpeaker,
  onAnswer,
  onReject,
  onEnd,
  localStream,
  remoteStream,
  t
}: CallModalProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, videoEnabled]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [remoteStream]);

  if (!isOpen) return null;

  return (
    <div className="call-modal">
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {isVideo && (
        <div className="video-grid">
          <div className="video-tile">
            <video ref={remoteVideoRef} autoPlay playsInline />
            <div className="label">
              {callerName} {speakerMuted && "🔇"}
            </div>
          </div>
          <div className="video-tile local">
            <video ref={localVideoRef} autoPlay playsInline muted />
            <div className="label">You {micMuted && "🔇"}</div>
          </div>
        </div>
      )}

      <div className="call-card">
        {!isVideo && (
          <div className="call-pulse">
            <div className="avatar huge">{callerName[0]?.toUpperCase()}</div>
          </div>
        )}

        <h2>
          {isIncoming 
            ? (isVideo ? t.incomingVideo || "Video qo'ng'iroq" : t.incomingCall || "Kiruvchi qo'ng'iroq")
            : isVideo ? t.videoTitle || "Video qo'ng'iroq" : t.voiceTitle || "Ovozli qo'ng'iroq"
          }
        </h2>
        <p>{isIncoming ? `${callerName} is calling...` : status}</p>
        {!isIncoming && duration !== "00:00" && <div className="call-duration">{duration}</div>}

        <div className="call-controls">
          {isIncoming ? (
            <>
              <button className="call-btn hangup" onClick={onReject}>
                <UIcon name="close" size={20} />
              </button>
              <button className="call-btn active" style={{ width: 72, height: 72 }} onClick={onAnswer}>
                <UIcon name="phone" size={24} />
              </button>
            </>
          ) : (
            <>
              <button className={`call-btn ${micMuted ? "muted" : ""}`} onClick={onToggleMic} title={micMuted ? "Unmute" : "Mute"}>
                <UIcon name={micMuted ? "mic-off" : "mic"} size={20} />
              </button>
              <button className={`call-btn ${!videoEnabled ? "muted" : ""}`} onClick={onToggleVideo} title={videoEnabled ? "Camera off" : "Camera on"}>
                <UIcon name={videoEnabled ? "video" : "video-off"} size={20} />
              </button>
              <button className={`call-btn ${speakerMuted ? "muted" : ""}`} onClick={onToggleSpeaker} title="Speaker">
                <UIcon name={speakerMuted ? "volume-mute" : "volume"} size={20} />
              </button>
              <button className="call-btn hangup" onClick={onEnd}>
                <UIcon name="close" size={20} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
