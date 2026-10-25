import { type ReactNode, useId } from "react";

/** The invalid look, for an input whose value failed a check. */
export const INVALID = "border-danger ring-1 ring-danger bg-danger/5";
/** The same look for a native constraint (`required`, `type="email"`…) the browser rejected, so the field stays marked after the browser's tooltip fades. */
export const USER_INVALID =
	"user-invalid:border-danger user-invalid:ring-1 user-invalid:ring-danger user-invalid:bg-danger/5";

export type Control = {
	id: string;
	"aria-describedby"?: string;
	"aria-invalid"?: true;
};

/** The message under a failing field: warning icon + text. */
export function FieldMessage({
	id,
	children,
}: {
	id?: string;
	children: ReactNode;
}) {
	return (
		<p
			id={id}
			role="alert"
			className="flex items-start gap-1.5 font-medium text-[12px] text-danger"
		>
			<svg
				aria-hidden
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				strokeWidth={1.75}
				strokeLinecap="round"
				strokeLinejoin="round"
				className="mt-[0.2em] h-[1em] w-[1em] shrink-0"
			>
				<path d="M8 1.75 15 14.25H1z" />
				<path d="M8 6.5v3.25M8 12v.01" />
			</svg>
			<span>{children}</span>
		</p>
	);
}

/**
 * A labelled control. The label is tied by `htmlFor` rather than wrapping, so
 * the control's name is the label alone; hint and error are its description.
 * The input's own invalid classes are the caller's job (`INVALID` when
 * `control["aria-invalid"]`), because inputs differ.
 */
export function Field({
	label,
	hint,
	error,
	className = "",
	labelClassName,
	children,
}: {
	label: ReactNode;
	hint?: ReactNode;
	error?: string;
	/** Wrapper classes, for the form's own layout. */
	className?: string;
	labelClassName?: string;
	children: (control: Control) => ReactNode;
}) {
	const id = useId();
	const describedBy =
		[hint ? `${id}-hint` : "", error ? `${id}-error` : ""]
			.filter(Boolean)
			.join(" ") || undefined;
	return (
		<div className={`flex flex-col gap-1 ${className}`}>
			<label htmlFor={id} className={labelClassName ?? "font-medium"}>
				{label}
			</label>
			{children({
				id,
				"aria-describedby": describedBy,
				"aria-invalid": error ? true : undefined,
			})}
			{hint && (
				<span id={`${id}-hint`} className="text-[#5c574e] text-[12px]">
					{hint}
				</span>
			)}
			{error && <FieldMessage id={`${id}-error`}>{error}</FieldMessage>}
		</div>
	);
}

/** Focus the first field marked invalid inside `root`, after the marks render. Focus also scrolls it into view — on a phone the submit button can be a screen below the field. */
export function focusFirstInvalid(root: ParentNode | null | undefined) {
	requestAnimationFrame(() =>
		root?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
	);
}
