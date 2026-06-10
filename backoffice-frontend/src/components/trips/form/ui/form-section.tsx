export function FormSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-extrabold tracking-[-0.02em]">
          <span className="mr-1 text-[#e9272e]">*</span>
          {title}
        </h2>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
