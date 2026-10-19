"use client";

import { useEffect, useRef } from "react";
import type * as THREE from "three";
import { captureError } from "@/lib/analytics";
import { BUILD_QUERY, clamp01, trackProgress } from "@/lib/scroll/beats";

type Three = typeof THREE;

/** The build finishes here, leaving the last stretch of the track for the closing copy. */
const BUILD_END = 0.88;

/**
 * The landing hero: an empty room that builds into a finished kitchen as the
 * visitor scrolls, from the "EzCabinet Webpage Design" Landing file.
 *
 * Mounts a canvas inside the sticky stage of the enclosing `[data-build-track]`
 * and drives the server-rendered overlays (`[data-ov]`) from the same eased
 * progress, so the captions and the scene never disagree. With no JavaScript,
 * or before three arrives, the overlays' own inline styles are the hero: the
 * intro copy, readable, and nothing else.
 *
 * It runs on phones too, with a camera that follows each part in close on a
 * portrait screen, drawn lighter there (a 1.5× pixel ratio cap, a 1024²
 * shadow map). Outside `BUILD_QUERY` — reduced
 * motion — the page shows the photo hero instead and this island never
 * downloads three. So does a device whose WebGL fails.
 *
 * Its own small scene, not the planner's: nothing here is a catalogue cabinet,
 * and the planner's lighting rule (`Lighting.tsx`) is about the studio.
 */
export default function HeroBuild({ labelFont }: { labelFont: string }) {
	const hostRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const host = hostRef.current;
		const track = host?.closest<HTMLElement>("[data-build-track]");
		if (!host || !track) return;

		const mq = matchMedia(BUILD_QUERY);
		let stop: (() => void) | null = null;
		let loading = false;
		let gone = false;

		const fail = (error: unknown) => {
			// Hands the hero to the photo (`[data-build-failed]` in globals.css).
			(
				track.closest<HTMLElement>("[data-landing]") ?? track
			).dataset.buildFailed = "";
			stop?.();
			stop = null;
			captureError(error, { where: "landing-hero" });
		};

		const evaluate = () => {
			if (!mq.matches) {
				stop?.();
				stop = null;
				return;
			}
			if (stop || loading) return;
			loading = true;
			import("three")
				.then((T) => {
					loading = false;
					if (gone || stop || !mq.matches) return;
					try {
						stop = build(T, host, track, labelFont, fail);
					} catch (error) {
						fail(error);
					}
				})
				.catch((error) => {
					loading = false;
					fail(error);
				});
		};

		evaluate();
		mq.addEventListener("change", evaluate);
		return () => {
			gone = true;
			mq.removeEventListener("change", evaluate);
			stop?.();
		};
	}, [labelFont]);

	return <div ref={hostRef} aria-hidden="true" className="absolute inset-0" />;
}

/** Builds the scene into `host` and returns its teardown. */
function build(
	T: Three,
	host: HTMLElement,
	track: HTMLElement,
	labelFont: string,
	fail: (error: unknown) => void,
): () => void {
	const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
	const eo = (t: number) => 1 - (1 - t) ** 3;
	const eio = (t: number) =>
		t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
	const eb = (t: number) => {
		const c1 = 1.70158;
		const c3 = c1 + 1;
		return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
	};
	const C = (hex: string) => new T.Color(hex);

	// A phone: fewer pixels and a smaller shadow map, which is most of the
	// cost on a mid-range Android, for a difference nobody sees at that size.
	const small = Math.min(innerWidth, innerHeight) < 760;
	const renderer = new T.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = T.PCFShadowMap;
	renderer.toneMapping = T.ACESFilmicToneMapping;
	renderer.localClippingEnabled = true;
	renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
	host.appendChild(renderer.domElement);

	const scene = new T.Scene();
	const B0 = C("#e6e3de");
	const B1 = C("#ece4d8");
	const background = B0.clone();
	scene.background = background;
	const camera = new T.PerspectiveCamera(30, 1, 0.1, 100);

	const RAW = C("#e2cba4");
	const RAWD = C("#d3b98f");
	const KICK = "#3a332c";
	const PLY = 0.018;

	type Role = "base" | "tall" | "wall" | "island" | "top";
	type Offset = { dx?: number; dy?: number; dz?: number };
	const steps: { t0: number; t1: number; fn: (l: number) => void }[] = [];
	const fronts: { mat: THREE.MeshStandardMaterial; role: Role; x: number }[] =
		[];
	const handles: { o: THREE.Object3D; x: number }[] = [];
	const handleMats: THREE.MeshStandardMaterial[] = [];
	const wallMats: THREE.MeshStandardMaterial[] = [];

	const anim = (t0: number, t1: number, fn: (l: number) => void) =>
		steps.push({ t0, t1, fn });
	const fade = (o: THREE.Object3D, v: number) => {
		const opacity = clamp01(v);
		o.traverse((n) => {
			const m = (n as THREE.Mesh).material as THREE.Material | undefined;
			if (!m) return;
			m.opacity = opacity;
			const want = (n as THREE.Sprite).isSprite || opacity < 0.999;
			if (m.transparent !== want) {
				m.transparent = want;
				m.needsUpdate = true;
			}
		});
	};
	const std = (color: THREE.ColorRepresentation, r = 0.72, m = 0) =>
		new T.MeshStandardMaterial({ color, roughness: r, metalness: m });
	const box = (
		w: number,
		h: number,
		d: number,
		mat: THREE.Material,
		x: number,
		y: number,
		z: number,
	) => {
		const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
		mesh.position.set(x, y, z);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		return mesh;
	};
	const appear = (
		o: THREE.Object3D,
		t0: number,
		t1: number,
		off: Offset,
		ease = eo,
	) => {
		const b = o.position.clone();
		const { dx = 0, dy = 0, dz = 0 } = off;
		anim(t0, t1, (l) => {
			o.visible = l > 0;
			const e = 1 - ease(l);
			o.position.set(b.x + dx * e, b.y + dy * e, b.z + dz * e);
			fade(o, l * 2.5);
		});
	};
	const pop = (o: THREE.Object3D, t0: number, t1: number) =>
		anim(t0, t1, (l) => {
			o.visible = l > 0;
			const s = Math.max(0.001, eb(l));
			o.scale.set(s, s, s);
		});
	const handleMat = () => {
		const m = std(C("#b8904f"), 0.35, 0.85);
		handleMats.push(m);
		return m;
	};

	const plankCanvas = () => {
		const c = document.createElement("canvas");
		c.width = c.height = 1024;
		const g = c.getContext("2d");
		if (!g) return c;
		const rows = 10;
		const rh = 1024 / rows;
		for (let r = 0; r < rows; r++) {
			let x = -Math.random() * 500;
			while (x < 1024) {
				const len = 380 + Math.random() * 420;
				g.fillStyle = `hsl(${29 + Math.random() * 6} 40% ${60 + Math.random() * 8}%)`;
				g.fillRect(x, r * rh, len, rh);
				for (let i = 0; i < 14; i++) {
					g.strokeStyle = `rgba(110,72,40,${0.05 + Math.random() * 0.08})`;
					g.lineWidth = 1 + Math.random() * 1.5;
					const yy = r * rh + 4 + Math.random() * (rh - 8);
					g.beginPath();
					g.moveTo(x, yy);
					g.bezierCurveTo(
						x + len * 0.3,
						yy + (Math.random() - 0.5) * 8,
						x + len * 0.7,
						yy + (Math.random() - 0.5) * 8,
						x + len,
						yy + (Math.random() - 0.5) * 4,
					);
					g.stroke();
				}
				g.fillStyle = "rgba(70,45,25,.55)";
				g.fillRect(x, r * rh, 2, rh);
				x += len;
			}
			g.fillStyle = "rgba(70,45,25,.5)";
			g.fillRect(0, r * rh, 1024, 2);
		}
		return c;
	};
	const tileCanvas = () => {
		const c = document.createElement("canvas");
		c.width = c.height = 512;
		const g = c.getContext("2d");
		if (!g) return c;
		g.fillStyle = "#cdc5b7";
		g.fillRect(0, 0, 512, 512);
		const cols = 4;
		const rows = 8;
		const tw = 512 / cols;
		const th = 512 / rows;
		for (let r = 0; r < rows; r++)
			for (let q = 0; q < cols; q++) {
				g.fillStyle = `hsl(40 24% ${89 + Math.random() * 5}%)`;
				g.fillRect(q * tw + 2, r * th + 2, tw - 4, th - 4);
			}
		return c;
	};
	const tex = (canvas: HTMLCanvasElement, rx: number, ry: number) => {
		const t = new T.CanvasTexture(canvas);
		t.colorSpace = T.SRGBColorSpace;
		t.wrapS = t.wrapT = T.RepeatWrapping;
		t.repeat.set(rx, ry);
		t.anisotropy = 8;
		return t;
	};

	// Room shell: slab, back wall, left wall with a window.
	scene.add(box(4.92, 0.16, 4.2, std("#c4beb5", 0.95), 2.34, -0.08, 2.1));
	const W0 = C("#ccc7bf");
	const W1 = C("#efe9e0");
	const wm = () => {
		const m = std(W0.clone(), 0.92);
		wallMats.push(m);
		return m;
	};
	scene.add(box(4.92, 2.7, 0.12, wm(), 2.34, 1.35, -0.06));
	scene.add(box(0.12, 2.7, 2.0, wm(), -0.06, 1.35, 1.0));
	scene.add(box(0.12, 2.7, 0.8, wm(), -0.06, 1.35, 3.8));
	scene.add(box(0.12, 0.95, 1.4, wm(), -0.06, 0.475, 2.7));
	scene.add(box(0.12, 0.45, 1.4, wm(), -0.06, 2.475, 2.7));
	const frame = std("#2b2825", 0.6);
	for (const [w, h, d, y, z] of [
		[0.13, 0.04, 1.4, 0.97, 2.7],
		[0.13, 0.04, 1.4, 2.23, 2.7],
		[0.13, 1.3, 0.04, 1.6, 2.02],
		[0.13, 1.3, 0.04, 1.6, 3.38],
		[0.13, 1.3, 0.03, 1.6, 2.7],
	])
		scene.add(box(w, h, d, frame, -0.06, y, z));
	anim(0.8, 0.85, (l) => {
		const e = eio(l);
		for (const m of wallMats) m.color.copy(W0).lerp(W1, e);
	});

	// The empty room's dimensions, gone once the first carcass lands.
	const dims = new T.Group();
	scene.add(dims);
	const bar = (
		w: number,
		h: number,
		d: number,
		x: number,
		y: number,
		z: number,
	) => {
		const m = new T.Mesh(
			new T.BoxGeometry(w, h, d),
			new T.MeshBasicMaterial({ color: C("#3b2a1f"), transparent: true }),
		);
		m.position.set(x, y, z);
		dims.add(m);
	};
	bar(4.8, 0.014, 0.014, 2.4, 2.95, -0.06);
	bar(0.014, 0.16, 0.014, 0, 2.95, -0.06);
	bar(0.014, 0.16, 0.014, 4.8, 2.95, -0.06);
	bar(0.014, 0.014, 4.2, -0.06, 2.95, 2.1);
	bar(0.014, 0.16, 0.014, -0.06, 2.95, 4.2);
	bar(0.014, 2.7, 0.014, 5.02, 1.35, 0);
	bar(0.16, 0.014, 0.014, 5.02, 0.007, 0);
	bar(0.16, 0.014, 0.014, 5.02, 2.7, 0);
	const labels: [HTMLCanvasElement, string, THREE.CanvasTexture][] = [];
	const drawLabel = (c: HTMLCanvasElement, text: string) => {
		const g = c.getContext("2d");
		if (!g) return;
		g.clearRect(0, 0, c.width, c.height);
		g.fillStyle = "rgba(251,248,244,.94)";
		g.beginPath();
		g.roundRect(4, 4, c.width - 8, c.height - 8, (c.height - 8) / 2);
		g.fill();
		g.fillStyle = "#3b2a1f";
		g.font = `700 52px ${labelFont}`;
		g.textAlign = "center";
		g.textBaseline = "middle";
		g.fillText(text, c.width / 2, c.height / 2 + 2);
	};
	const label = (text: string, x: number, y: number, z: number) => {
		const c = document.createElement("canvas");
		c.width = 352;
		c.height = 104;
		drawLabel(c, text);
		const t = new T.CanvasTexture(c);
		t.colorSpace = T.SRGBColorSpace;
		const s = new T.Sprite(
			new T.SpriteMaterial({ map: t, transparent: true, depthTest: false }),
		);
		s.scale.set(0.56, 0.165, 1);
		s.position.set(x, y, z);
		s.renderOrder = 10;
		dims.add(s);
		labels.push([c, text, t]);
	};
	label("4,800 mm", 2.4, 3.14, -0.06);
	label("4,200 mm", -0.06, 3.14, 2.1);
	label("2,700 mm", 5.4, 1.35, 0);
	let dirty = true;
	document.fonts?.ready.then(() => {
		for (const [c, text, t] of labels) {
			drawLabel(c, text);
			t.needsUpdate = true;
		}
		dirty = true;
	});
	anim(0.075, 0.13, (l) => {
		dims.visible = l < 1;
		fade(dims, 1 - l);
	});

	// Builders.
	const carcass = (
		x0: number,
		w: number,
		y0: number,
		H: number,
		D: number,
		t: number,
		stagger: number,
		dur: number,
		plinth: boolean,
	) => {
		const iw = w - 2 * PLY;
		const pieces: [THREE.Mesh, Offset][] = [
			[
				box(iw, PLY, D, std(RAW.clone()), x0 + w / 2, y0 + PLY / 2, D / 2),
				{ dy: 0.5 },
			],
			[
				box(PLY, H, D, std(RAW.clone()), x0 + PLY / 2, y0 + H / 2, D / 2),
				{ dx: -0.3, dy: 0.25 },
			],
			[
				box(PLY, H, D, std(RAW.clone()), x0 + w - PLY / 2, y0 + H / 2, D / 2),
				{ dx: 0.3, dy: 0.25 },
			],
			[
				box(
					iw,
					H - PLY,
					0.008,
					std(RAWD.clone()),
					x0 + w / 2,
					y0 + PLY + (H - PLY) / 2,
					0.004,
				),
				{ dz: 0.7 },
			],
			[
				box(iw, PLY, D, std(RAW.clone()), x0 + w / 2, y0 + H - PLY / 2, D / 2),
				{ dy: 0.45 },
			],
		];
		if (plinth)
			pieces.push([
				box(w, 0.1, PLY, std(KICK, 0.8), x0 + w / 2, 0.05, D - 0.07),
				{ dz: 0.4 },
			]);
		pieces.forEach(([m, off], i) => {
			scene.add(m);
			appear(m, t + i * stagger, t + i * stagger + dur, off);
		});
		return pieces.map(([m]) => m);
	};
	const door = (
		x0: number,
		w: number,
		y0: number,
		h: number,
		z: number,
		hinge: "L" | "R",
		t0: number,
		t1: number,
		role: Role,
		top: boolean,
	) => {
		const pivot = new T.Group();
		const sx = hinge === "L" ? 1 : -1;
		pivot.position.set(hinge === "L" ? x0 : x0 + w, y0 + h / 2, z + PLY / 2);
		const mat = std(RAW.clone(), 0.55);
		pivot.add(box(w - 0.004, h - 0.004, PLY, mat, (sx * w) / 2, 0, 0));
		const hl = Math.min(0.2, h * 0.35);
		const hy = (top ? 1 : -1) * (h / 2 - 0.05 - hl / 2);
		const hd = box(
			0.012,
			hl,
			0.014,
			handleMat(),
			sx * (w - 0.045),
			hy,
			PLY / 2 + 0.012,
		);
		pivot.add(hd);
		scene.add(pivot);
		fronts.push({ mat, role, x: x0 + w / 2 });
		handles.push({ o: hd, x: x0 + w / 2 });
		const angle = -sx * 1.9;
		anim(t0, t1, (l) => {
			pivot.visible = l > 0;
			pivot.rotation.y = angle * (1 - eio(l));
			fade(pivot, l * 3);
		});
	};
	const drawer = (
		x0: number,
		w: number,
		y0: number,
		h: number,
		z: number,
		t0: number,
		t1: number,
		role: Role,
	) => {
		const g = new T.Group();
		g.position.set(x0 + w / 2, y0 + h / 2, z + PLY / 2);
		const mat = std(RAW.clone(), 0.55);
		g.add(box(w - 0.004, h - 0.004, PLY, mat, 0, 0, 0));
		g.add(
			box(w - 0.07, h * 0.62, 0.44, std(RAWD.clone()), 0, -h * 0.12, -0.23),
		);
		const hd = box(
			Math.min(0.32, w * 0.5),
			0.012,
			0.014,
			handleMat(),
			0,
			h > 0.2 ? h / 2 - 0.06 : 0,
			PLY / 2 + 0.012,
		);
		g.add(hd);
		scene.add(g);
		fronts.push({ mat, role, x: x0 + w / 2 });
		handles.push({ o: hd, x: x0 + w / 2 });
		const b = g.position.z;
		anim(t0, t1, (l) => {
			g.visible = l > 0;
			g.position.z = b + 0.42 * (1 - eo(l));
			fade(g, l * 3);
		});
	};

	// Stage 1: base carcasses.
	const BY = 0.1;
	const BH = 0.72;
	const BD = 0.56;
	const RUN: [number, number][] = [
		[0.6, 0.8],
		[1.4, 0.6],
		[2.0, 0.6],
		[2.6, 0.8],
		[3.4, 0.8],
	];
	RUN.forEach(([x0, w], i) => {
		carcass(x0, w, BY, BH, BD, 0.105 + i * 0.05, 0.007, 0.03, true);
	});

	// Stage 2: worktop, sink, hob, base fronts.
	const worktopMat = std(RAW.clone(), 0.5);
	const worktop = box(3.6, 0.04, 0.6, worktopMat, 2.4, 0.84, 0.3);
	scene.add(worktop);
	appear(worktop, 0.38, 0.415, { dy: 0.7 });
	fronts.push({ mat: worktopMat, role: "top", x: 2.4 });
	const sink = new T.Group();
	sink.position.set(1.0, 0.86, 0.3);
	sink.add(box(0.52, 0.006, 0.42, std("#a3a5a7", 0.3, 0.7), 0, 0.003, 0));
	sink.add(box(0.46, 0.004, 0.36, std("#5f6163", 0.35, 0.6), 0, 0.0065, 0));
	scene.add(sink);
	appear(sink, 0.405, 0.43, { dy: 0.25 });
	const hob = new T.Group();
	hob.position.set(2.3, 0.86, 0.3);
	hob.add(box(0.58, 0.006, 0.5, std("#121213", 0.15, 0.3), 0, 0.003, 0));
	for (const [x, z, r] of [
		[-0.13, -0.11, 0.075],
		[0.13, -0.11, 0.06],
		[-0.13, 0.11, 0.06],
		[0.13, 0.11, 0.075],
	]) {
		const ring = new T.Mesh(
			new T.TorusGeometry(r, 0.003, 6, 40),
			std("#3a3a3b", 0.4),
		);
		ring.rotation.x = Math.PI / 2;
		ring.position.set(x, 0.0065, z);
		hob.add(ring);
	}
	scene.add(hob);
	appear(hob, 0.41, 0.435, { dy: 0.25 });
	let fi = 0;
	const ft = (): [number, number] => {
		const t = 0.418 + fi * 0.0065;
		fi++;
		return [t, t + 0.025];
	};
	door(0.6, 0.4, BY, BH, BD, "L", ...ft(), "base", true);
	door(1.0, 0.4, BY, BH, BD, "R", ...ft(), "base", true);
	drawer(1.4, 0.6, 0.1, 0.27, BD, ...ft(), "base");
	drawer(1.4, 0.6, 0.37, 0.27, BD, ...ft(), "base");
	drawer(1.4, 0.6, 0.64, 0.18, BD, ...ft(), "base");
	const oven = new T.Group();
	oven.position.set(2.3, 0.395, BD + PLY / 2);
	oven.add(box(0.596, 0.586, 0.02, std("#1b1b1c", 0.25, 0.4), 0, 0, 0));
	oven.add(box(0.46, 0.28, 0.004, std("#0b0b0c", 0.1, 0.2), 0, -0.04, 0.012));
	oven.add(box(0.46, 0.014, 0.018, std("#c7c9cb", 0.3, 0.9), 0, 0.22, 0.03));
	scene.add(oven);
	{
		const [a, b] = ft();
		appear(oven, a, b, { dz: 0.45 });
	}
	drawer(2.0, 0.6, 0.69, 0.13, BD, ...ft(), "base");
	drawer(2.6, 0.8, 0.1, 0.36, BD, ...ft(), "base");
	drawer(2.6, 0.8, 0.46, 0.36, BD, ...ft(), "base");
	door(3.4, 0.4, BY, BH, BD, "L", ...ft(), "base", true);
	door(3.8, 0.4, BY, BH, BD, "R", ...ft(), "base", true);

	// Stage 3: tall units, wall units, island.
	const TH = 2.07;
	const TD = 0.58;
	carcass(0, 0.6, 0.1, TH, TD, 0.5, 0.007, 0.03, true);
	const rightTall = carcass(4.2, 0.6, 0.1, TH, TD, 0.525, 0.007, 0.03, true);
	// The right tall unit's outer side is the one end the camera sees: it
	// wears the tall finish, as an exposed end does in the planner.
	fronts.push({
		mat: rightTall[2].material as THREE.MeshStandardMaterial,
		role: "tall",
		x: 4.8,
	});
	const WY = 1.45;
	const WH = 0.72;
	const WD = 0.33;
	RUN.forEach(([x0, w], i) => {
		carcass(x0, w, WY, WH, WD, 0.55 + i * 0.02, 0.005, 0.025, false);
	});
	let wi = 0;
	const wtm = (): [number, number] => {
		const t = 0.655 + wi * 0.0045;
		wi++;
		return [t, t + 0.025];
	};
	door(0, 0.6, 0.1, 1.35, TD, "L", ...wtm(), "tall", true);
	door(0, 0.6, 1.45, 0.72, TD, "L", ...wtm(), "tall", false);
	door(0.6, 0.4, WY, WH, WD, "L", ...wtm(), "wall", false);
	door(1.0, 0.4, WY, WH, WD, "R", ...wtm(), "wall", false);
	door(1.4, 0.6, WY, WH, WD, "L", ...wtm(), "wall", false);
	door(2.0, 0.6, WY, WH, WD, "R", ...wtm(), "wall", false);
	door(2.6, 0.4, WY, WH, WD, "L", ...wtm(), "wall", false);
	door(3.0, 0.4, WY, WH, WD, "R", ...wtm(), "wall", false);
	door(3.4, 0.4, WY, WH, WD, "L", ...wtm(), "wall", false);
	door(3.8, 0.4, WY, WH, WD, "R", ...wtm(), "wall", false);
	door(4.2, 0.6, 0.1, 1.35, TD, "R", ...wtm(), "tall", true);
	door(4.2, 0.6, 1.45, 0.72, TD, "R", ...wtm(), "tall", false);
	const stripMat = new T.MeshStandardMaterial({
		color: C("#f5efe6"),
		emissive: C("#ffd7a1"),
		emissiveIntensity: 0,
	});
	const strip = new T.Mesh(new T.BoxGeometry(3.56, 0.008, 0.025), stripMat);
	strip.position.set(2.4, 1.446, 0.29);
	scene.add(strip);

	const IX = 1.3;
	const IW = 2.2;
	const IZ = 2.0;
	const ID = 0.9;
	const islandMat = std(RAW.clone());
	const island = new T.Mesh(
		new T.BoxGeometry(IW, 0.72, ID).translate(0, 0.36, 0),
		islandMat,
	);
	island.position.set(IX + IW / 2, 0.1, IZ + ID / 2);
	island.castShadow = true;
	island.receiveShadow = true;
	scene.add(island);
	anim(0.72, 0.755, (l) => {
		island.visible = l > 0;
		island.scale.y = Math.max(0.001, eo(l));
	});
	fronts.push({ mat: islandMat, role: "island", x: 2.4 });
	const islandKick = box(
		IW - 0.1,
		0.1,
		ID - 0.12,
		std(KICK, 0.8),
		IX + IW / 2,
		0.05,
		IZ + ID / 2,
	);
	scene.add(islandKick);
	anim(0.72, 0.73, (l) => {
		islandKick.visible = l > 0;
	});
	const islandTopMat = std(RAW.clone(), 0.5);
	const islandTop = box(
		IW + 0.2,
		0.04,
		ID + 0.12,
		islandTopMat,
		IX + IW / 2,
		0.84,
		IZ + ID / 2,
	);
	scene.add(islandTop);
	appear(islandTop, 0.75, 0.78, { dy: 0.7 });
	fronts.push({ mat: islandTopMat, role: "top", x: 2.4 });
	for (let c = 0; c < 3; c++) {
		const x0 = IX + (c * IW) / 3;
		const t = 0.765 + c * 0.012;
		drawer(x0, IW / 3, 0.1, 0.36, IZ + ID, t, t + 0.025, "island");
		drawer(x0, IW / 3, 0.46, 0.36, IZ + ID, t + 0.006, t + 0.031, "island");
	}

	// Stage 4: finishes, floor, backsplash, handles, tap. One palette, the
	// design's default: the brand green with oak wall units.
	const finish: Record<Role, THREE.Color> = {
		base: C("#2f4b3c"),
		tall: C("#2f4b3c"),
		wall: C("#c29a6a"),
		island: C("#2f4b3c"),
		top: C("#ece7de"),
	};
	for (const f of fronts) {
		const t0 = 0.8 + (f.x / 4.8) * 0.04;
		anim(t0, t0 + 0.028, (l) => {
			f.mat.color.copy(RAW).lerp(finish[f.role], eio(l));
		});
	}
	const floorClip = new T.Plane(new T.Vector3(0, 0, -1), 0);
	const wood = new T.Mesh(
		new T.PlaneGeometry(4.8, 4.2),
		new T.MeshStandardMaterial({
			map: tex(plankCanvas(), 2.4, 2.1),
			roughness: 0.62,
			clippingPlanes: [floorClip],
		}),
	);
	wood.rotation.x = -Math.PI / 2;
	wood.position.set(2.4, 0.003, 2.1);
	wood.receiveShadow = true;
	scene.add(wood);
	anim(0.8, 0.875, (l) => {
		wood.visible = l > 0;
		floorClip.constant = eio(l) * 4.22;
	});
	const splashClip = new T.Plane(new T.Vector3(-1, 0, 0), 0);
	const splash = new T.Mesh(
		new T.PlaneGeometry(3.6, 0.59),
		new T.MeshStandardMaterial({
			map: tex(tileCanvas(), 6, 0.98),
			roughness: 0.28,
			clippingPlanes: [splashClip],
		}),
	);
	splash.position.set(2.4, 1.155, 0.004);
	splash.receiveShadow = true;
	scene.add(splash);
	anim(0.83, 0.885, (l) => {
		splash.visible = l > 0;
		splashClip.constant = 0.6 + eio(l) * 3.62;
	});
	for (const h of handles) {
		const t0 = 0.855 + (h.x / 4.8) * 0.03;
		pop(h.o, t0, t0 + 0.02);
	}
	const tap = new T.Group();
	tap.position.set(1.0, 0.86, 0.07);
	const tapMat = handleMat();
	for (const [r, h, y] of [
		[0.022, 0.04, 0.02],
		[0.012, 0.3, 0.17],
	]) {
		const m = new T.Mesh(new T.CylinderGeometry(r, r, h, 20), tapMat);
		m.position.y = y;
		m.castShadow = true;
		tap.add(m);
	}
	const spout = new T.Mesh(
		new T.CylinderGeometry(0.011, 0.011, 0.2, 20),
		tapMat,
	);
	spout.rotation.x = Math.PI / 2;
	spout.position.set(0, 0.31, 0.1);
	tap.add(spout);
	scene.add(tap);
	pop(tap, 0.87, 0.895);

	// Stage 5: props, pendants, lights.
	const plant = new T.Group();
	plant.position.set(3.98, 0.86, 0.26);
	const pot = new T.Mesh(
		new T.CylinderGeometry(0.085, 0.065, 0.16, 28),
		std("#b5735a", 0.85),
	);
	pot.position.y = 0.08;
	pot.castShadow = true;
	plant.add(pot);
	for (const [x, y, z, r] of [
		[0, 0.21, 0, 0.11],
		[0.06, 0.28, 0.02, 0.08],
		[-0.06, 0.27, -0.01, 0.085],
		[0.01, 0.34, 0.03, 0.07],
	]) {
		const m = new T.Mesh(new T.IcosahedronGeometry(r, 1), std("#56744a", 0.8));
		m.position.set(x, y, z);
		m.castShadow = true;
		plant.add(m);
	}
	scene.add(plant);
	appear(plant, 0.9, 0.93, { dy: 0.3 });
	const board = box(0.3, 0.4, 0.02, std("#b07f4f", 0.6), 3.05, 1.065, 0.05);
	board.rotation.x = -0.1;
	scene.add(board);
	appear(board, 0.905, 0.935, { dy: 0.3 });
	const bowl = new T.Group();
	bowl.position.set(2.7, 1.01, 2.45);
	bowl.add(
		new T.Mesh(
			new T.SphereGeometry(
				0.15,
				32,
				16,
				0,
				Math.PI * 2,
				Math.PI / 2,
				Math.PI / 2,
			),
			new T.MeshStandardMaterial({
				color: C("#e9e1d3"),
				roughness: 0.5,
				side: T.DoubleSide,
			}),
		),
	);
	for (const [x, y, z] of [
		[0, -0.07, 0],
		[0.06, -0.08, 0.03],
		[-0.05, -0.08, 0.04],
	]) {
		const fruit = new T.Mesh(
			new T.SphereGeometry(0.045, 20, 14),
			std("#e3a33c", 0.6),
		);
		fruit.position.set(x, y, z);
		bowl.add(fruit);
	}
	bowl.traverse((n) => {
		if ((n as THREE.Mesh).isMesh) n.castShadow = true;
	});
	scene.add(bowl);
	appear(bowl, 0.91, 0.94, { dy: 0.3 });

	const bulbs: THREE.MeshStandardMaterial[] = [];
	const pendants: THREE.PointLight[] = [];
	[1.75, 2.4, 3.05].forEach((x, i) => {
		const g = new T.Group();
		g.position.set(x, 0, 2.45);
		const cord = new T.Mesh(
			new T.CylinderGeometry(0.004, 0.004, 0.84, 6),
			std("#1a1a1a"),
		);
		cord.position.y = 2.28;
		g.add(cord);
		const shade = new T.Mesh(
			new T.CylinderGeometry(0.035, 0.15, 0.2, 40, 1, true),
			new T.MeshStandardMaterial({
				color: C("#1f1f1e"),
				roughness: 0.5,
				metalness: 0.3,
				side: T.DoubleSide,
			}),
		);
		shade.position.y = 1.76;
		shade.castShadow = true;
		g.add(shade);
		const bulbMat = new T.MeshStandardMaterial({
			color: C("#fff3df"),
			emissive: C("#ffcf8f"),
			emissiveIntensity: 0,
		});
		const bulb = new T.Mesh(new T.SphereGeometry(0.038, 20, 12), bulbMat);
		bulb.position.y = 1.69;
		g.add(bulb);
		bulbs.push(bulbMat);
		const light = new T.PointLight(C("#ffcf96"), 0, 6, 2);
		light.position.set(x, 1.6, 2.45);
		scene.add(light);
		pendants.push(light);
		scene.add(g);
		appear(g, 0.9 + i * 0.008, 0.94 + i * 0.008, { dy: 1.2 });
	});
	const underLights = [1.2, 2.4, 3.6].map((x) => {
		const l = new T.PointLight(C("#ffd6a0"), 0, 1.6, 2);
		l.position.set(x, 1.38, 0.32);
		scene.add(l);
		return l;
	});

	const H0 = C("#e2e8ef");
	const H1 = C("#fff0de");
	const S0 = C("#fff7ee");
	const S1 = C("#ffe2bd");
	const hemi = new T.HemisphereLight(H0.clone(), C("#9c958b"), 1.5);
	scene.add(hemi);
	const sun = new T.DirectionalLight(S0.clone(), 2.6);
	const target = new T.Object3D();
	target.position.set(2.2, 0, 2.2);
	scene.add(target);
	sun.target = target;
	sun.position.set(-2.3, 7.5, 5.4);
	sun.castShadow = true;
	sun.shadow.mapSize.setScalar(small ? 1024 : 2048);
	Object.assign(sun.shadow.camera, {
		left: -6,
		right: 6,
		top: 6,
		bottom: -6,
		near: 0.5,
		far: 25,
	});
	sun.shadow.bias = -0.0003;
	sun.shadow.normalBias = 0.02;
	sun.shadow.radius = 4;
	scene.add(sun);
	const fill = new T.DirectionalLight(C("#ffffff"), 0.7);
	fill.position.set(9, 5, 9);
	scene.add(fill);
	anim(0.8, 1, (l) => {
		const e = eio(l);
		hemi.color.copy(H0).lerp(H1, e);
		sun.color.copy(S0).lerp(S1, e);
		background.copy(B0).lerp(B1, e);
	});
	anim(0.93, 0.99, (l) => {
		const e = eio(l);
		for (const p of pendants) p.intensity = e * 2.2;
		for (const b of bulbs) b.emissiveIntensity = e * 4;
		for (const u of underLights) u.intensity = e * 0.9;
		stripMat.emissiveIntensity = e * 2.5;
	});
	anim(0.66, 0.67, (l) => {
		strip.visible = l > 0;
	});

	// Camera path: a high three-quarter view of the empty room, easing down
	// and in to eye level as the kitchen fills it.
	const CA = { az: 0.6, el: 0.43, r: 12.6 };
	const CB = { az: 0.8, el: 0.2, r: 9.4 };
	const TA = new T.Vector3(2.4, 0.75, 1.9);
	const TB = new T.Vector3(2.5, 1.0, 1.55);
	const aim = new T.Vector3();
	let distance = 1;
	// On a portrait phone the room is too small to watch whole, so the camera
	// follows the build instead: in close on each part as it lands, back out
	// for the finished kitchen. Each key is [progress, aim x, y, z, azimuth,
	// elevation, distance at 390×844].
	const PHONE_KEYS = [
		[0, 2.4, 0.9, 1.9, 0.35, 0.5, 26],
		[0.1, 1.2, 0.6, 0.6, 0.3, 0.42, 14],
		[0.37, 3.6, 0.6, 0.6, 0.42, 0.42, 14],
		[0.5, 2.4, 0.8, 0.6, 0.35, 0.35, 17],
		[0.66, 2.4, 1.45, 0.6, 0.3, 0.25, 19],
		[0.8, 2.4, 0.8, 1.9, 0.5, 0.38, 18],
		[0.92, 2.4, 1.0, 1.5, 0.45, 0.28, 22],
		[1, 2.4, 1.0, 1.4, 0.42, 0.24, 22],
	];
	// How far the room sits below centre on a phone, as a fraction of the
	// stage's height: clear of the intro copy and the final card, which sit at
	// the top, less so while only a caption is there.
	const PHONE_SHIFT = [
		[0, -0.2],
		[0.12, -0.04],
		[0.92, -0.04],
		[0.97, -0.17],
		[1, -0.17],
	];
	const keyed = (keys: number[][], p: number) => {
		let i = 0;
		while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
		const a = keys[i];
		const b = keys[i + 1];
		const e = eio(seg(p, a[0], b[0]));
		return a.map((v, j) => v + (b[j] - v) * e);
	};
	let phone = false;
	let shift: number | null = null;
	const placeCamera = (p: number) => {
		if (phone) {
			const [, x, y, z, az, el, r0] = keyed(PHONE_KEYS, p);
			// A wider phone needs less distance; never under three quarters.
			const r = r0 * Math.max(0.75, 0.462 / (width / height));
			aim.set(x, y, z);
			camera.position.set(
				x + r * Math.cos(el) * Math.sin(az),
				y + r * Math.sin(el),
				z + r * Math.cos(el) * Math.cos(az),
			);
			camera.lookAt(aim);
			const oy = keyed(PHONE_SHIFT, p)[1] * height;
			if (shift === null || Math.abs(oy - shift) > 0.5) {
				camera.setViewOffset(width, height, 0, oy, width, height);
				shift = oy;
			}
			return;
		}
		const e = eio(clamp01(p / 0.96));
		const az = CA.az + (CB.az - CA.az) * e;
		const el = CA.el + (CB.el - CA.el) * e;
		const r = (CA.r + (CB.r - CA.r) * e) * distance;
		aim.lerpVectors(TA, TB, e);
		camera.position.set(
			aim.x + r * Math.cos(el) * Math.sin(az),
			aim.y + r * Math.sin(el),
			aim.z + r * Math.cos(el) * Math.cos(az),
		);
		camera.lookAt(aim);
	};
	let width = 0;
	let height = 0;
	const resize = () => {
		const w = host.clientWidth || 1;
		const h = host.clientHeight || 1;
		const a = w / h;
		renderer.setSize(w, h, false);
		camera.aspect = a;
		// Pull back on narrow stages so the whole run stays in frame.
		distance = a >= 1.35 ? 1 : Math.min(2.6, 1 + (1.35 - a) * 1.6);
		// Shift the room right of centre on wide stages, clear of the copy. A
		// portrait phone takes its own path and shift in `placeCamera`.
		if (w > 900) camera.setViewOffset(w, h, -w * 0.13, 0, w, h);
		else camera.clearViewOffset();
		phone = w <= 900 && a < 0.85;
		shift = null;
		camera.updateProjectionMatrix();
		width = w;
		height = h;
		dirty = true;
	};

	// Overlays: the server-rendered captions, driven from the same progress.
	const overlay: Record<string, HTMLElement> = {};
	for (const el of track.querySelectorAll<HTMLElement>("[data-ov]"))
		overlay[el.dataset.ov ?? ""] = el;
	const setOverlay = (el: HTMLElement | undefined, o: number, dy: number) => {
		if (!el) return;
		el.style.opacity = String(o);
		el.style.transform = `translateY(${dy}px)`;
		el.style.visibility = o < 0.02 ? "hidden" : "visible";
	};
	const CAPTIONS: [number, number][] = [
		[0.1, 0.38],
		[0.38, 0.5],
		[0.5, 0.8],
		[0.8, 0.915],
	];
	// The example kitchen's total: [progress at which a part lands, RM it
	// adds]. Illustrative figures — the scene is not catalogue cabinets, and
	// the card on the page says so. Each step eases in as its part arrives.
	const PRICES: [number, number][] = [
		[0.16, 460],
		[0.21, 520],
		[0.26, 410],
		[0.31, 610],
		[0.36, 450],
		[0.415, 780],
		[0.43, 320],
		[0.47, 690],
		[0.57, 980],
		[0.6, 980],
		[0.69, 1650],
		[0.79, 1840],
		[0.86, 540],
		[0.9, 180],
	];
	const total = overlay.price?.querySelector<HTMLElement>("[data-price]");
	const priceAt = (p: number) =>
		PRICES.reduce((sum, [t, rm]) => sum + rm * eo(seg(p, t - 0.012, t)), 0);
	const overlays = (p: number) => {
		setOverlay(overlay.price, seg(p, 0.1, 0.12), 0);
		if (total)
			total.textContent = `RM ${Math.round(priceAt(p)).toLocaleString("en-MY")}`;
		const intro = 1 - seg(p, 0.025, 0.085);
		setOverlay(overlay.intro, intro, -28 * (1 - intro));
		setOverlay(overlay.hint, 1 - seg(p, 0, 0.025), 0);
		CAPTIONS.forEach(([a, b], i) => {
			const o = Math.min(seg(p, a, a + 0.02), 1 - seg(p, b - 0.02, b));
			setOverlay(overlay[`s${i + 1}`], o, 14 * (1 - o));
		});
		const final = seg(p, 0.925, 0.975);
		setOverlay(overlay.final, final, 20 * (1 - final));
		if (overlay.bar) overlay.bar.style.transform = `scaleX(${p})`;
	};
	const update = (p: number) => {
		for (const s of steps) s.fn(clamp01((p - s.t0) / (s.t1 - s.t0)));
		placeCamera(p);
	};

	// The loop runs only while the track is near the viewport, and draws only
	// when the eased progress has moved: idle, it costs one rect read a frame.
	let p = 0;
	let last = -1;
	let raf = 0;
	const loop = () => {
		raf = requestAnimationFrame(loop);
		if (host.clientWidth !== width || host.clientHeight !== height) resize();
		const sp = trackProgress(
			track.getBoundingClientRect().top,
			track.offsetHeight,
			innerHeight,
		);
		const goal = clamp01(sp / BUILD_END);
		p += (goal - p) * 0.1;
		if (Math.abs(goal - p) < 0.0004) p = goal;
		if (p !== last || dirty) {
			last = p;
			dirty = false;
			update(p);
			overlays(p);
			renderer.render(scene, camera);
		}
	};
	const observer = new IntersectionObserver(
		([entry]) => {
			cancelAnimationFrame(raf);
			if (entry.isIntersecting) loop();
		},
		{ rootMargin: "40px 0px" },
	);
	observer.observe(track);

	const onLost = (event: Event) => {
		event.preventDefault();
		fail(new Error("WebGL context lost"));
	};
	renderer.domElement.addEventListener("webglcontextlost", onLost);

	resize();

	return () => {
		observer.disconnect();
		cancelAnimationFrame(raf);
		renderer.domElement.removeEventListener("webglcontextlost", onLost);
		scene.traverse((n) => {
			const mesh = n as THREE.Mesh;
			mesh.geometry?.dispose();
			const m = mesh.material as THREE.MeshStandardMaterial | undefined;
			m?.map?.dispose();
			m?.dispose();
		});
		renderer.dispose();
		renderer.domElement.remove();
	};
}
