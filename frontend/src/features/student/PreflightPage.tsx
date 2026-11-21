import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import Typography from '@mui/material/Typography';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import MicNoneOutlinedIcon from '@mui/icons-material/MicNoneOutlined';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import WifiIcon from '@mui/icons-material/Wifi';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { API_BASE } from '../../api/client';
import { completePreflight, fetchAttemptState } from '../../api/attemptApi';
import { clearAttemptSession, readAttemptSession } from '../../auth/storage';
import { LoadingBlock } from '../../components/LoadingBlock';
import { StudentShell } from './StudentShell';

const STEPS = ['Full screen', 'Internet', 'Device', 'Microphone & noise', 'Camera & gaze', 'Photo'];

const NOISE_QUIET_DB = -38;
const PHOTO_WIDTH = 640;
const PHOTO_HEIGHT = 480;

type CheckKey = 'fullscreen' | 'connection' | 'device' | 'mic' | 'noise' | 'camera' | 'gaze';

type Checks = Record<CheckKey, boolean>;

interface FaceDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
}

interface FaceDetectorCtor {
  new (options?: { fastMode?: boolean; maxDetectedFaces?: number }): FaceDetectorLike;
}

function faceDetectorCtor(): FaceDetectorCtor | null {
  const candidate = (window as unknown as { FaceDetector?: FaceDetectorCtor }).FaceDetector;
  return typeof candidate === 'function' ? candidate : null;
}

function isFullscreen(): boolean {
  return typeof document !== 'undefined' && document.fullscreenElement !== null;
}

function supportsFullscreen(): boolean {
  return typeof document !== 'undefined' && document.fullscreenEnabled === true;
}

function describeMediaError(caught: unknown, device: string): string {
  const name = caught instanceof DOMException ? caught.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return `Access to the ${device} was blocked. Allow it in the browser address bar, then retry.`;
    case 'NotFoundError':
    case 'OverconstrainedError':
      return `No ${device} was found. Connect one and retry.`;
    case 'NotReadableError':
      return `The ${device} is in use by another application. Close it and retry.`;
    default:
      return `The ${device} check could not run. Check your browser permissions and retry.`;
  }
}

export function PreflightPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = Number(attemptId);
  const valid = Number.isFinite(id);
  const session = valid ? readAttemptSession(id) : null;
  const token = session?.sessionToken ?? '';

  const [step, setStep] = useState(0);
  const [checks, setChecks] = useState<Checks>({
    fullscreen: false,
    connection: false,
    device: false,
    mic: false,
    noise: false,
    camera: false,
    gaze: false,
  });
  const [deviceAck, setDeviceAck] = useState(false);
  const [connectionMs, setConnectionMs] = useState<number | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [noiseDb, setNoiseDb] = useState<number | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [faceSeen, setFaceSeen] = useState(false);
  const [gazeMethod, setGazeMethod] = useState<'face-detector' | 'attested' | null>(null);
  const [attested, setAttested] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const detectTimerRef = useRef<number | null>(null);
  const captureTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const deviceInfo = {
    cores: typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null,
    memory: typeof (navigator as unknown as { deviceMemory?: number }).deviceMemory === 'number'
      ? (navigator as unknown as { deviceMemory: number }).deviceMemory
      : null,
    screen: typeof window !== 'undefined' ? `${window.screen.width}×${window.screen.height}` : 'unknown',
  };

  const stopCamera = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (detectTimerRef.current !== null) {
      window.clearInterval(detectTimerRef.current);
      detectTimerRef.current = null;
    }
  }, []);

  const stopMic = useCallback(() => {
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
  }, []);

  const stopAll = useCallback(() => {
    stopCamera();
    stopMic();
    if (captureTimerRef.current !== null) {
      window.clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
  }, [stopCamera, stopMic]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopAll();
    };
  }, [stopAll]);

  useEffect(() => {
    const sync = () => setChecks((current) => ({ ...current, fullscreen: isFullscreen() }));
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const stateQuery = useQuery({
    queryKey: ['attempt', id],
    enabled: valid && Boolean(session),
    retry: false,
    queryFn: () => fetchAttemptState(id, token),
  });

  useEffect(() => {
    const onUnauthorized = (event: Event) => {
      const detail = (event as CustomEvent<{ scope?: string }>).detail;
      if (detail?.scope === 'attempt') {
        if (valid) {
          clearAttemptSession(id);
        }
        navigate('/join', { replace: true });
      }
    };
    window.addEventListener('examguard:unauthorized', onUnauthorized);
    return () => window.removeEventListener('examguard:unauthorized', onUnauthorized);
  }, [id, navigate, valid]);

  const runConnectionCheck = useCallback(async () => {
    setCheckingConnection(true);
    setConnectionError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    const startedAt = performance.now();
    try {
      const response = await fetch(`${API_BASE}/health`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Server answered ${response.status}`);
      }
      const elapsed = Math.max(1, Math.round(performance.now() - startedAt));
      setConnectionMs(elapsed);
      setChecks((current) => ({ ...current, connection: navigator.onLine !== false }));
    } catch {
      setConnectionError(
        navigator.onLine === false
          ? 'This device reports no internet connection. Reconnect to Wi-Fi or mobile data.'
          : 'The exam server could not be reached. Check your connection, then retry.',
      );
      setChecks((current) => ({ ...current, connection: false }));
    } finally {
      window.clearTimeout(timeout);
      setCheckingConnection(false);
    }
  }, []);

  useEffect(() => {
    if (step === 1 && !checks.connection && !checkingConnection && connectionMs === null) {
      void runConnectionCheck();
    }
  }, [step, checks.connection, checkingConnection, connectionMs, runConnectionCheck]);

  const deviceAutoOk =
    (deviceInfo.cores === null || deviceInfo.cores >= 2) &&
    (typeof window === 'undefined' || (window.screen.width >= 1024 && window.screen.height >= 600));

  useEffect(() => {
    setChecks((current) => ({ ...current, device: deviceAutoOk && deviceAck }));
  }, [deviceAutoOk, deviceAck]);

  const sampleNoise = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError('This browser does not expose microphone access. Use a current Chrome, Edge or Firefox.');
      return;
    }
    setMicError(null);
    setMeasuring(true);
    setNoiseDb(null);
    setChecks((current) => ({ ...current, mic: false, noise: false }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      micStreamRef.current = stream;
      setChecks((current) => ({ ...current, mic: true }));

      const context = new AudioContext();
      audioContextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);

      const samples: number[] = [];
      await new Promise<void>((resolve) => {
        const timer = window.setInterval(() => {
          if (!mountedRef.current) {
            window.clearInterval(timer);
            resolve();
            return;
          }
          analyser.getFloatTimeDomainData(buffer);
          let sum = 0;
          for (const value of buffer) {
            sum += value * value;
          }
          const rms = Math.sqrt(sum / buffer.length);
          const db = rms > 0 ? 20 * Math.log10(rms) : -80;
          samples.push(db);
          setNoiseDb(Math.round(db));
          if (samples.length >= 20) {
            window.clearInterval(timer);
            resolve();
          }
        }, 100);
      });

      const average = samples.reduce((total, value) => total + value, 0) / Math.max(1, samples.length);
      const quiet = average <= NOISE_QUIET_DB;
      setNoiseDb(Math.round(average));
      setChecks((current) => ({ ...current, noise: quiet }));
      if (!quiet) {
        setMicError(
          'The room is too noisy for this check. Move somewhere quieter, close windows and retry.',
        );
      } else {
        stopMic();
      }
    } catch (caught) {
      setMicError(describeMediaError(caught, 'microphone'));
      stopMic();
    } finally {
      if (mountedRef.current) {
        setMeasuring(false);
      }
    }
  }, [stopMic]);

  useEffect(() => {
    if (step === 3 && checks.mic && !measuring && noiseDb !== null) {
      const thresholdOk = noiseDb <= NOISE_QUIET_DB;
      setChecks((current) => ({ ...current, noise: thresholdOk }));
    }
  }, [step, checks.mic, measuring, noiseDb]);

  const watchFace = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const Detector = faceDetectorCtor();
    if (!Detector) {
      setGazeMethod('attested');
      return;
    }
    const detector = new Detector({ fastMode: true, maxDetectedFaces: 1 });
    if (detectTimerRef.current !== null) {
      window.clearInterval(detectTimerRef.current);
    }
    detectTimerRef.current = window.setInterval(() => {
      if (!video.videoWidth || video.readyState < 2) {
        return;
      }
      detector
        .detect(video)
        .then((faces) => {
          if (!mountedRef.current) {
            return;
          }
          const face = faces[0];
          if (!face) {
            setFaceSeen(false);
            setChecks((current) => ({ ...current, gaze: false }));
            return;
          }
          const box = face.boundingBox;
          const centreX = box.x + box.width / 2;
          const centreY = box.y + box.height / 2;
          const onScreen =
            Math.abs(centreX - video.videoWidth / 2) < video.videoWidth * 0.25 &&
            Math.abs(centreY - video.videoHeight / 2) < video.videoHeight * 0.3 &&
            box.width > video.videoWidth * 0.12 &&
            box.width < video.videoWidth * 0.85;
          setFaceSeen(true);
          setGazeMethod('face-detector');
          setChecks((current) => ({ ...current, gaze: onScreen }));
        })
        .catch(() => {
          // A transient detector failure should not fail the step; the next tick retries.
        });
    }, 500);
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('This browser does not expose camera access. Use a current Chrome, Edge or Firefox.');
      return;
    }
    setCameraError(null);
    setPhoto(null);
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: PHOTO_WIDTH }, height: { ideal: PHOTO_HEIGHT }, facingMode: 'user' },
        audio: false,
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setChecks((current) => ({ ...current, camera: true, gaze: false }));
      watchFace();
    } catch (caught) {
      setCameraError(describeMediaError(caught, 'camera'));
      setChecks((current) => ({ ...current, camera: false, gaze: false }));
    }
  }, [stopCamera, watchFace]);

  useEffect(() => {
    if (step < 4) {
      return;
    }
    const video = videoRef.current;
    const stream = cameraStreamRef.current;
    if (video && stream && video.srcObject !== stream) {
      video.srcObject = stream;
      void video.play().catch(() => undefined);
    }
  }, [step]);

  useEffect(() => {
    if (step === 4 && !checks.camera && !cameraError) {
      void startCamera();
    }
  }, [step, checks.camera, cameraError, startCamera]);

  useEffect(() => {
    if (gazeMethod === 'attested') {
      setChecks((current) => ({ ...current, gaze: checks.camera && attested }));
    }
  }, [gazeMethod, attested, checks.camera]);

  useEffect(() => {
    if (step >= 5) {
      return;
    }
    if (countdown !== null) {
      setCountdown(null);
    }
  }, [step, countdown]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) {
      setCameraError('The camera has no picture yet. Wait a moment and retry.');
      return;
    }
    canvas.width = PHOTO_WIDTH;
    canvas.height = PHOTO_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('This browser could not process the camera picture.');
      return;
    }
    context.drawImage(video, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);
    setPhoto(canvas.toDataURL('image/jpeg', 0.72));
  }, []);

  const startCountdown = useCallback(() => {
    if (captureTimerRef.current !== null) {
      window.clearInterval(captureTimerRef.current);
    }
    setPhoto(null);
    setCountdown(3);
    captureTimerRef.current = window.setInterval(() => {
      setCountdown((current) => {
        if (current === null) {
          return null;
        }
        if (current <= 1) {
          if (captureTimerRef.current !== null) {
            window.clearInterval(captureTimerRef.current);
            captureTimerRef.current = null;
          }
          capture();
          return null;
        }
        return current - 1;
      });
    }, 1000);
  }, [capture]);

  if (!valid || !session) {
    return <Navigate to="/join" replace />;
  }

  if (stateQuery.isLoading) {
    return (
      <StudentShell title="Pre-exam checks">
        <LoadingBlock rows={5} />
      </StudentShell>
    );
  }

  if (stateQuery.isError) {
    return (
      <StudentShell title="Pre-exam checks">
        <Alert severity="error">
          {stateQuery.error.message} If this keeps happening, ask your invigilator for help.
        </Alert>
      </StudentShell>
    );
  }

  const state = stateQuery.data;
  if (!state) {
    return (
      <StudentShell title="Pre-exam checks">
        <LoadingBlock rows={5} />
      </StudentShell>
    );
  }

  if (state.status === 'SUBMITTED') {
    return <Navigate to={`/attempt/${id}/submitted`} replace />;
  }

  if (state.status !== 'IN_PROGRESS') {
    return <Navigate to={`/attempt/${id}`} replace />;
  }

  if (!state.requiresPreflight || state.preflightCompletedAt) {
    return <Navigate to={`/attempt/${id}`} replace />;
  }

  const stepReady = [
    checks.fullscreen || !supportsFullscreen(),
    checks.connection,
    checks.device,
    checks.mic && checks.noise,
    checks.camera && checks.gaze,
    photo !== null && checks.camera && checks.gaze,
  ][step];

  const confirm = async () => {
    if (!photo) {
      setSubmitError('Take the photo before starting the exam.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await completePreflight(id, token, {
        fullscreen: isFullscreen(),
        connectionOk: checks.connection,
        deviceOk: checks.device,
        micOk: checks.mic,
        noiseOk: checks.noise,
        cameraOk: checks.camera,
        faceDetected: faceSeen || gazeMethod === 'attested',
        gazeOnScreen: checks.gaze,
        noiseLevel: noiseDb === null ? null : `${noiseDb} dBFS`,
        photoDataUrl: photo,
        checks: {
          gazeMethod,
          cores: deviceInfo.cores,
          memoryGb: deviceInfo.memory,
          screen: deviceInfo.screen,
          connectionMs,
          ambientNoiseDb: noiseDb,
          fullscreen: isFullscreen(),
          userAgent: navigator.userAgent,
        },
      });
      stopAll();
      await queryClient.invalidateQueries({ queryKey: ['attempt', id] });
      navigate(`/attempt/${id}`, { replace: true });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The checks could not be saved.';
      setSubmitError(`${message} Keep this window open and confirm again.`);
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const enterFullscreen = async () => {
    if (typeof document.documentElement.requestFullscreen !== 'function') {
      setChecks((current) => ({ ...current, fullscreen: true }));
      return;
    }
    try {
      await document.documentElement.requestFullscreen();
      setChecks((current) => ({ ...current, fullscreen: true }));
    } catch {
      setChecks((current) => ({ ...current, fullscreen: false }));
    }
  };

  return (
    <StudentShell title={state.exam.title} maxWidth="md">
      <Stack spacing={3}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Before the timer starts
          </Typography>
          <Typography variant="h4" gutterBottom>
            Pre-exam checks
          </Typography>
          <Typography color="text.secondary">
            The exam clock starts only after these checks and your photo are confirmed. You will see{' '}
            {state.exam.durationMinutes} minutes from that moment.
          </Typography>
        </Box>

        <Stepper activeStep={step} alternativeLabel>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          {step === 0 ? (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <FullscreenIcon color="primary" />
                <Typography variant="h6">Stay in full screen</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                The exam runs in full screen so that other windows cannot share the screen. If you
                leave full screen during the exam, the tab records it and the invigilator may review
                it. Press the button below, then continue.
              </Typography>
              {!supportsFullscreen() ? (
                <Alert severity="warning">
                  This browser cannot enforce full screen. Maximise the window and keep other
                  applications closed.
                </Alert>
              ) : null}
              <Stack direction="row" spacing={1} alignItems="center">
                <Button variant="contained" startIcon={<FullscreenIcon />} onClick={() => void enterFullscreen()}>
                  Enter full screen
                </Button>
                {checks.fullscreen ? (
                  <Chip color="success" icon={<CheckCircleIcon />} label="Full screen active" />
                ) : null}
              </Stack>
            </Stack>
          ) : null}

          {step === 1 ? (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <WifiIcon color="primary" />
                <Typography variant="h6">Internet connection</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Answers save continuously. If the connection drops mid-answer, the exam stops at the
                deadline and the answers saved up to then are kept.
              </Typography>
              {checkingConnection ? (
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <CircularProgress size={20} />
                  <Typography variant="body2">Checking the exam server…</Typography>
                </Stack>
              ) : null}
              {connectionError ? <Alert severity="error">{connectionError}</Alert> : null}
              {checks.connection && connectionMs !== null ? (
                <Alert severity="success">
                  Connection healthy · the exam server answered in {connectionMs} ms.
                </Alert>
              ) : null}
              <Box>
                <Button
                  variant="outlined"
                  onClick={() => void runConnectionCheck()}
                  disabled={checkingConnection}
                >
                  {checkingConnection ? 'Checking…' : 'Test connection again'}
                </Button>
              </Box>
            </Stack>
          ) : null}

          {step === 2 ? (
            <Stack spacing={2}>
              <Typography variant="h6">Device check</Typography>
              <Typography variant="body2" color="text.secondary">
                Use a laptop or desktop with a working screen, camera and microphone. Keep the
                charger connected and close other applications.
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip label={`Screen ${deviceInfo.screen}`} variant="outlined" />
                <Chip
                  label={`${deviceInfo.cores ?? 'unknown'} CPU cores`}
                  variant="outlined"
                  color={deviceInfo.cores === null || deviceInfo.cores >= 2 ? 'default' : 'error'}
                />
                {deviceInfo.memory !== null ? (
                  <Chip label={`${deviceInfo.memory} GB memory`} variant="outlined" />
                ) : null}
              </Stack>
              {!deviceAutoOk ? (
                <Alert severity="error">
                  This device is below the minimum for a timed exam (at least 2 CPU cores and a
                  1024×600 screen). Ask your invigilator for another device.
                </Alert>
              ) : (
                <FormControlLabel
                  control={
                    <Checkbox checked={deviceAck} onChange={(event) => setDeviceAck(event.target.checked)} />
                  }
                  label="My device is plugged in or fully charged, the screen is readable and other applications are closed."
                />
              )}
            </Stack>
          ) : null}

          {step === 3 ? (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <MicNoneOutlinedIcon color="primary" />
                <Typography variant="h6">Microphone and room noise</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                A two-second sample checks that your microphone works and the room is quiet. The
                microphone is released as soon as the sample ends.
              </Typography>
              {micError ? <Alert severity="error">{micError}</Alert> : null}
              {measuring ? (
                <Stack spacing={1}>
                  <Typography variant="body2">Listening…</Typography>
                  <LinearProgress
                    variant="determinate"
                    value={noiseDb === null ? 0 : Math.min(100, Math.max(0, ((noiseDb + 70) / 70) * 100))}
                  />
                  <Typography variant="caption" color="text.secondary">
                    Ambient level {noiseDb ?? '—'} dBFS (quiet is {NOISE_QUIET_DB} dBFS or lower)
                  </Typography>
                </Stack>
              ) : null}
              {!micError && checks.mic && checks.noise && !measuring ? (
                <Alert severity="success">
                  Microphone works. Room noise {noiseDb ?? '—'} dBFS is within the quiet range. The
                  microphone is now released.
                </Alert>
              ) : null}
              <Box>
                <Button variant="contained" onClick={() => void sampleNoise()} disabled={measuring}>
                  {measuring ? 'Sampling…' : checks.mic ? 'Test again' : 'Allow microphone and test'}
                </Button>
              </Box>
            </Stack>
          ) : null}

          {step === 4 ? (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <CameraAltOutlinedIcon color="primary" />
                <Typography variant="h6">Camera and on-screen gaze</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Look straight at the screen. The camera stays on for the preview and the photo, then
                it is released before the exam starts. Nothing is recorded beyond the photo you
                confirm.
              </Typography>
              {cameraError ? <Alert severity="error">{cameraError}</Alert> : null}
              <Box
                sx={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: 420,
                  aspectRatio: '4 / 3',
                  borderRadius: 1,
                  overflow: 'hidden',
                  bgcolor: 'grey.900',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                {!checks.camera ? (
                  <Typography variant="body2" sx={{ color: 'grey.300', position: 'absolute' }}>
                    Camera preview appears after you allow access.
                  </Typography>
                ) : null}
              </Box>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {gazeMethod === 'face-detector' ? (
                  <Chip
                    color={checks.gaze ? 'success' : 'warning'}
                    label={checks.gaze ? 'Face detected, looking at the screen' : 'Face not centred'}
                  />
                ) : null}
                {gazeMethod === 'attested' ? (
                  <FormControlLabel
                    control={<Checkbox checked={attested} onChange={(event) => setAttested(event.target.checked)} />}
                    label="The camera preview shows my face and I am looking directly at the screen."
                  />
                ) : null}
              </Stack>
              {gazeMethod === 'attested' ? (
                <Typography variant="caption" color="text.secondary">
                  This browser cannot estimate gaze automatically, so your confirmation is recorded
                  with the photo for review.
                </Typography>
              ) : null}
              <Box>
                <Button
                  variant="outlined"
                  onClick={() => void startCamera()}
                  disabled={!cameraError && checks.camera}
                >
                  {checks.camera ? 'Camera ready' : 'Allow camera'}
                </Button>
              </Box>
            </Stack>
          ) : null}

          {step === 5 ? (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <PhotoCameraIcon color="primary" />
                <Typography variant="h6">Take your photo</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Sit up, look at the camera and press the shutter. When the countdown ends the photo is
                captured and shown to you. Only the photo you confirm is stored with the attempt.
              </Typography>
              <video
                ref={videoRef}
                muted
                playsInline
                style={{
                  width: '100%',
                  maxWidth: 420,
                  aspectRatio: '4 / 3',
                  objectFit: 'cover',
                  borderRadius: 8,
                  background: '#111',
                }}
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              {countdown !== null ? (
                <Typography variant="h3" textAlign="center">
                  {countdown}
                </Typography>
              ) : null}
              {photo ? (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Review your photo
                  </Typography>
                  <img
                    src={photo}
                    alt="Your identity photo for this attempt"
                    style={{ width: '100%', maxWidth: 420, borderRadius: 8 }}
                  />
                </Box>
              ) : null}
              {submitError ? <Alert severity="error">{submitError}</Alert> : null}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button variant="outlined" onClick={startCountdown} disabled={countdown !== null}>
                  {photo ? 'Retake photo' : 'Start 3-second countdown'}
                </Button>
                <Button
                  variant="contained"
                  onClick={() => void confirm()}
                  disabled={!photo || submitting || !checks.gaze}
                >
                  {submitting ? 'Starting exam…' : 'Confirm and start the timer'}
                </Button>
              </Stack>
              {!checks.gaze ? (
                <Typography variant="caption" color="error">
                  Return to the previous step: your face must be visible and on screen before the
                  photo can be confirmed.
                </Typography>
              ) : null}
            </Stack>
          ) : null}

          <Divider sx={{ my: 3 }} />
          <Stack direction="row" spacing={1} justifyContent="space-between">
            <Button disabled={step === 0 || submitting} onClick={() => setStep((current) => current - 1)}>
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                variant="contained"
                disabled={!stepReady}
                onClick={() => setStep((current) => current + 1)}
              >
                Continue
              </Button>
            ) : (
              <Typography variant="caption" color="text.secondary">
                The timer starts when you confirm above.
              </Typography>
            )}
          </Stack>
        </Paper>

        <Alert severity="info" variant="outlined">
          Leaving full screen, losing the connection or losing focus during the exam is recorded. A
          person reviews the record before any action is taken.
        </Alert>
      </Stack>
    </StudentShell>
  );
}
