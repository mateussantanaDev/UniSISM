import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/tokens.dart';
import '../../core/theme/typography.dart';

/// Input controlado com label uppercase + suporte a mono. Espelha o
/// `<FormField>` da Face UBS (sem o `grid-span` que não faz sentido em mobile).
class AppFormField extends StatefulWidget {
  const AppFormField({
    super.key,
    required this.label,
    this.controller,
    this.initialValue,
    this.onChanged,
    this.type = AppFieldType.text,
    this.mono = false,
    this.readOnly = false,
    this.loading = false,
    this.error,
    this.hint,
    this.maxLength,
    this.autofocus = false,
    this.textInputAction,
    this.onSubmitted,
  }) : assert(
         controller == null || initialValue == null,
         'Use controller OU initialValue, não os dois.',
       );

  final String label;
  final TextEditingController? controller;
  final String? initialValue;
  final ValueChanged<String>? onChanged;
  final AppFieldType type;
  final bool mono;
  final bool readOnly;
  final bool loading;
  final String? error;
  final String? hint;
  final int? maxLength;
  final bool autofocus;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;

  @override
  State<AppFormField> createState() => _AppFormFieldState();
}

class _AppFormFieldState extends State<AppFormField> {
  bool _obscureText = true;

  @override
  Widget build(BuildContext context) {
    final inputStyle = widget.mono ? AppTypography.inputMono : AppTypography.input;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(widget.label.toUpperCase(), style: AppTypography.label),
        const SizedBox(height: 5),
        Stack(
          children: [
            TextFormField(
              controller: widget.controller,
              initialValue: widget.initialValue,
              onChanged: widget.onChanged,
              onFieldSubmitted: widget.onSubmitted,
              readOnly: widget.readOnly || widget.loading,
              autofocus: widget.autofocus,
              textInputAction: widget.textInputAction,
              maxLength: widget.maxLength,
              obscureText: widget.type == AppFieldType.password ? _obscureText : false,
              keyboardType: _keyboard(),
              inputFormatters: _formatters(),
              style: inputStyle,
              cursorColor: Tokens.blue900,
              decoration: InputDecoration(
                hintText: widget.hint,
                errorText: widget.error,
                fillColor: widget.readOnly ? Tokens.slate50 : Colors.white,
                counterText: '',
                isDense: true,
                suffixIcon: widget.type == AppFieldType.password
                    ? IconButton(
                        icon: Icon(
                          _obscureText ? Icons.visibility : Icons.visibility_off,
                          color: Tokens.slate500,
                          size: 20,
                        ),
                        onPressed: () {
                          setState(() {
                            _obscureText = !_obscureText;
                          });
                        },
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      )
                    : null,
              ),
            ),
            if (widget.loading)
              Positioned.fill(
                child: ColoredBox(
                  color: Colors.white.withValues(alpha: 0.7),
                  child: const Center(
                    child: SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }

  TextInputType _keyboard() => switch (widget.type) {
    AppFieldType.email => TextInputType.emailAddress,
    AppFieldType.number => TextInputType.number,
    AppFieldType.date => TextInputType.datetime,
    AppFieldType.password || AppFieldType.text => TextInputType.text,
  };

  List<TextInputFormatter>? _formatters() => switch (widget.type) {
    AppFieldType.number => [FilteringTextInputFormatter.digitsOnly],
    _ => null,
  };
}

enum AppFieldType { text, password, email, number, date }
