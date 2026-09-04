## Human Metabolic System Model

### Human Body Profile

The following four subsections establish the physical profile — parameters, state variable, and the derived indices built from them — that the rest of the model reads from.

#### Human Anthropometric Parameters

Height (h), age (a), and sex (σ) are the model's fixed anthropometric and demographic parameters — individual-specific quantities that do not evolve over the timescale of the energy-balance dynamics, and enter the equations as coefficients rather than as evolving quantities.

#### Human Body Mass State Variable

Body mass (m) is the model's state variable — the one quantity that actually evolves over time, changing under the energy-balance feedback loop and, in turn, feeding back into that same loop the next day. Because a single day's reading of m fluctuates with water and glycogen rather than clean mass change, the model reads its 7-day rolling average, m̄ — eqn. \eqref{eqn_msmo} — instead.

    m̄ = \frac{1}{7} × Σ m(t−i), i = 0…6 {#eqn_msmo}

#### Healthy Human Body Mass Index

The healthy body mass m_g can equivalently be expressed as a healthy body mass index, BMI_g, computed from m_g and height h. A BMI between 18.5 and 24.9 is the World Health Organization's healthy-weight band \cite{ref_who1995}, and this figure is flagged when it falls outside that range. The relationship between m_g and BMI_g is given in eqn. \eqref{eqn_bmig}.

    BMI_{g} = \frac{m_{g}}{(h/100)^{2}} {#eqn_bmig}

#### Human Lean Body Mass Parameter

Lean body mass (LBM) is estimated from body mass, height, and sex by the Boer (1984) formula \cite{ref_boer1984}, applied sex-specifically — eqn. \eqref{eqn_lbmm} for males, eqn. \eqref{eqn_lbmf} for females.

    LBM = 0.407×m̄ + 0.267×h − 19.2 {#eqn_lbmm}
    LBM = 0.252×m̄ + 0.473×h − 48.3 {#eqn_lbmf}

### Energy Balance Components

The following six subsections build up the daily energy balance itself — resting and activity expenditure, the sleep and food-related corrections to it, the weekly rate it has to sustain, and the daily intake that identity solves for.

#### Resting Metabolic Rate

The Katch-McArdle equation predicts resting metabolic rate directly from lean body mass rather than from age and sex, reflecting that metabolically active tissue — not fat mass — drives resting energy expenditure \cite{ref_katch1996}, as given in eqn. \eqref{eqn_bmrk}.

    BMR = 370 + 21.6×LBM {#eqn_bmrk}

The Mifflin-St Jeor equation instead predicts resting metabolic rate from body mass, height, age, and sex, and was derived by regression on indirect-calorimetry measurements from 498 healthy adults \cite{ref_mifflin1990}, as given in eqn. \eqref{eqn_bmrm}; it serves as the model's default resting-metabolic-rate formula.

    BMR = 10×m̄ + 6.25×h − 5×a + σ {#eqn_bmrm}

#### Activity Burn

Activity burn quantifies the additional energy expended by scheduled physical activity, computed from metabolic equivalents (MET), body mass, activity duration (τ), oxygen uptake per MET (κ), and the oxygen energy yield (ε), following the generalized metabolic equations of the American College of Sports Medicine \cite{ref_acsm2017}, as given in eqn. \eqref{eqn_eact}.

    E_{a} = \frac{MET × m̄ × τ × κ}{ε} {#eqn_eact}

#### Sleep Deprivation Effect

Insufficient sleep has been shown to reduce fat loss and increase lean-mass loss during caloric restriction \cite{ref_nedeltcheva2010}, so a given energy deficit yields less fat loss on a short night than on a full one. The Sleep Efficiency Factor η captures this reduction as a function of the sleep deprivation rate (γ), the assumed desire sleep (s_desire), and actual sleep length (s), as given in eqn. \eqref{eqn_slef}.

    η = 1 − \frac{γ}{100} × max(0, s_{desire} − s) {#eqn_slef}

#### Weekly Fat Loss Rate

A weekly body-mass loss of 0.5–1% is the range associated with preserving lean mass and strength during caloric restriction in trained individuals, whereas faster loss increasingly comes at the expense of lean tissue \cite{ref_garthe2011}. This share of body mass is defined in eqn. \eqref{eqn_dmpc}. There, Δm is the desire weekly fat loss in kilograms, and Δm% expresses that loss as a percentage of the current body mass m̄. The corresponding daily energy deficit D is then obtained by converting that weekly fat loss into a daily figure via the fat energy density ρ, adjusted by the Sleep Efficiency Factor η, as given in eqn. \eqref{eqn_defc}.

    Δm% = 100 × \frac{Δm}{m̄} {#eqn_dmpc}
    D = \frac{Δm × ρ}{7 × η} {#eqn_defc}

#### Thermic Effect of Food

Digesting, absorbing, and metabolizing food itself consumes energy — the thermic effect of food (TEF) — typically amounting to 5–15% of daily energy expenditure on a mixed diet, with protein eliciting the largest effect per calorie \cite{ref_westerterp2004}. The thermic cost differs by macronutrient — commonly cited figures put protein near 20–30% of its own calories, carbohydrate near 5–10%, and fat near 0–3% \cite{ref_westerterp2004} — but here TEF is modeled as a single fixed share f of the desire daily intake (Eᵢₙ, introduced below) rather than a macronutrient-weighted sum, as given in eqn. \eqref{eqn_tefq}, and is folded into the intake identity by solving rather than by simple addition.

    TEF = f × E_{in} {#eqn_tefq}

#### Desire Daily Intake

The desire daily intake Eᵢₙ is the calorie level that, net of the thermic effect of food, still leaves the desired deficit D on top of maintenance (BMR + Eₐ). Because TEF is itself a share of Eᵢₙ rather than a fixed amount, the identity is solved for Eᵢₙ directly — placing (1 − f) in the denominator — instead of treating TEF as a further subtraction, as given in eqn. \eqref{eqn_eink}.

    E_{in} = BMR + E_{a} + TEF − D = \frac{BMR + E_{a} − D}{1 − f} {#eqn_eink}

### Maintenance and Mass Trajectory

Maintenance energy expenditure M(m̄) = A + B×m̄ is affine in body mass under either resting-metabolic-rate formula, with the coefficients A and B given in eqns. \eqref{eqn_amif}–\eqref{eqn_bkat}. Under Katch-McArdle, c_m, c_h, and c_0 are the same sex-specific Boer coefficients from eqn. \eqref{eqn_lbmm}/\eqref{eqn_lbmf} (0.407, 0.267, −19.2 for males; 0.252, 0.473, −48.3 for females), substituted in place of LBM so A and B stay linear in h alone. Holding intake Eᵢₙ fixed then drives body mass toward a single equilibrium m∞ = (Eᵢₙ − A)/B, as given in eqn. \eqref{eqn_meqm}, and mass approaches that equilibrium exponentially over the elapsed time t (in days) rather than linearly — the same first-order dynamics used to model human body-weight change under sustained energy imbalance \cite{ref_chow2008} — as given in eqn. \eqref{eqn_mdec}, with t to a healthy mass following from inverting that decay in eqn. \eqref{eqn_tday}.

When a fixed weekly percentage of body mass Δm% is held instead of a fixed intake, the loop closes differently: mass is re-derived from itself every period rather than converging on an equilibrium, giving proportional decay with no plateau, as given in eqns. \eqref{eqn_mprp}–\eqref{eqn_tprp}.

Metabolic adaptation drags this trajectory further: sustained dieting lowers BMR faster than the lost mass alone explains, growing with weeks on the diet (t/7) up to a ceiling λt_max ≈ 10–15%, as given in eqn. \eqref{eqn_ladp}, and dragging BMR down by that same factor, as given in eqn. \eqref{eqn_bmra}. Because only the BMR-derived half of A and B actually depends on metabolic rate, the adapted coefficients scale just that half, per eqns. \eqref{eqn_amta}–\eqref{eqn_batk}, giving an adapted equilibrium m∞_a — sitting above the naively-computed m∞, which is the overshoot a constant-BMR forecast predicts — as given in eqn. \eqref{eqn_mplt}.

    A = \frac{6.25×h − 5×a + σ}{1 − f} under Mifflin {#eqn_amif}
    B = \frac{10 + (MET × τ × κ / ε)}{1 − f} under Mifflin {#eqn_bmif}
    A = \frac{370 + 21.6×(c_{h}×h + c_{0})}{1 − f} under Katch {#eqn_akat}
    B = \frac{21.6×c_{m} + (MET × τ × κ / ε)}{1 − f} under Katch {#eqn_bkat}
    m∞ = \frac{E_{in} − A}{B} {#eqn_meqm}
    m̄(t) = m∞ + (m̄ − m∞) × e^{−B×t/ρ} {#eqn_mdec}
    t = \frac{ρ}{B} × ln[ (m̄ − m∞) / (m_{g} − m∞) ] {#eqn_tday}
    m̄(t) = m̄ × (1 − Δm%/100)^{t/7} {#eqn_mprp}
    t = \frac{7 × ln(m̄ / m_{g})}{−ln(1 − Δm%/100)} {#eqn_tprp}
    λt = min(λ × t/7, λt_{max}) {#eqn_ladp}
    BMR_{a}(t) = BMR × (1 − λt) {#eqn_bmra}
    A_{a} = A × (1 − λt) {#eqn_amta}
    B_{a} = \frac{10×(1 − λt) + (MET × τ × κ / ε)}{1 − f} under Mifflin {#eqn_bata}
    B_{a} = \frac{21.6×c_{m}×(1 − λt) + (MET × τ × κ / ε)}{1 − f} under Katch {#eqn_batk}
    m∞_{a} = \frac{E_{in} − A_{a}}{B_{a}} {#eqn_mplt}

### Glycogen and Water Storage

Skeletal muscle stores glycogen at a density g_musc of roughly 13–15 g per kg of wet muscle mass, and each gram of stored glycogen binds a further r ≈ 3–4 g of water — figures drawn from classic glycogen-depletion and -repletion studies \cite{ref_olsson1970}. The muscle-tissue mass that actually holds glycogen is estimated from the skeletal-muscle share s of lean mass, as given in eqn. \eqref{eqn_mmus}; the resulting glycogen store, from that muscle mass at density g_musc plus a roughly constant liver reserve g_liver (≈ 100 g), is given in eqn. \eqref{eqn_mgly}; and the associated bound-water swing, scaled by r — the day-to-day scale movement glycogen and water can account for on their own, distinct from real fat-mass change — is given in eqn. \eqref{eqn_dmgl}.

    m_{musc} = s × LBM {#eqn_mmus}
    m_{gly} = g_{musc} × m_{musc} + g_{liver} {#eqn_mgly}
    ΔM_{gly} = \frac{m_{gly} × (1 + r)}{1000} {#eqn_dmgl}

### Dietary Requirements

The remaining four bands — protein, dietary fiber, fat, and carbohydrate — set healthy daily ranges for diet composition rather than for the size of the energy deficit itself, each scaled to lean mass or to intake, in the four subsections below.

#### Protein Requirements

Protein needs for energy-restricted, resistance-trained individuals with low body fat are estimated at a floor p_min and ceiling p_max of 2.3–3.1 g per kg of fat-free (lean) mass per day, scaled upward with the severity of caloric restriction and leanness \cite{ref_helms2014}. The corresponding lower and upper healthy daily protein amounts, P_min and P_max, are given in eqn. \eqref{eqn_pmin} and eqn. \eqref{eqn_pmax}.

    P_{min} = p_{min} × LBM {#eqn_pmin}
    P_{max} = p_{max} × LBM {#eqn_pmax}

#### Dietary Fiber Requirements

Dietary fiber intake is recommended relative to energy intake via a floor coefficient f_min of roughly 14 g per 1,000 kcal consumed, while a practical upper ceiling f_max is instead scaled to body weight, per the USDA Dietary Guidelines for Americans \cite{ref_usda2020}. These two different bases give the lower and upper healthy daily dietary fiber amounts, F_min and F_max, in eqn. \eqref{eqn_fmin} and eqn. \eqref{eqn_fmax} respectively.

    F_{min} = f_{min} × \frac{E_{in}}{1000} {#eqn_fmin}
    F_{max} = f_{max} × m̄ {#eqn_fmax}

#### Fat Requirements

Fat intake is recommended within an Acceptable Macronutrient Distribution Range (AMDR) of 20–35% of total energy intake for adults \cite{ref_iom2005}, the floor and ceiling percentages denoted k_min and k_max. Converted to grams at fat's fixed energy density of 9 kcal/g, this range gives the lower and upper healthy daily fat amounts, G_min and G_max, in eqn. \eqref{eqn_gmin} and eqn. \eqref{eqn_gmax}.

    G_{min} = \frac{(k_{min}/100) × E_{in}}{9} {#eqn_gmin}
    G_{max} = \frac{(k_{max}/100) × E_{in}}{9} {#eqn_gmax}

#### Carbohydrate Requirements

Carbohydrate intake carries the same AMDR structure, recommended at 45–65% of total energy intake for adults \cite{ref_iom2005}, the floor and ceiling percentages denoted q_min and q_max. Converted to grams at carbohydrate's fixed energy density of 4 kcal/g, this range gives the lower and upper healthy daily carbohydrate amounts, C_min and C_max, in eqn. \eqref{eqn_cmin} and eqn. \eqref{eqn_cmax}.

    C_{min} = \frac{(q_{min}/100) × E_{in}}{4} {#eqn_cmin}
    C_{max} = \frac{(q_{max}/100) × E_{in}}{4} {#eqn_cmax}

## References

```bibtex
@article{ref_boer1984,
  author  = {P. Boer},
  title   = {Estimated lean body mass as an index for normalization of body fluid volumes in humans},
  journal = {American Journal of Physiology},
  volume  = {247},
  number  = {4},
  pages   = {F632--F636},
  year    = {1984},
  doi     = {10.1152/ajprenal.1984.247.4.F632}
}

@book{ref_katch1996,
  author    = {F. I. Katch and W. D. McArdle},
  title     = {Introduction to Nutrition, Exercise, and Health},
  edition   = {4th},
  address   = {Philadelphia, PA, USA},
  publisher = {Lea \& Febiger},
  year      = {1996}
}

@article{ref_mifflin1990,
  author  = {M. D. Mifflin and S. T. St Jeor and L. A. Hill and B. J. Scott and S. A. Daugherty and Y. O. Koh},
  title   = {A new predictive equation for resting energy expenditure in healthy individuals},
  journal = {American Journal of Clinical Nutrition},
  volume  = {51},
  number  = {2},
  pages   = {241--247},
  year    = {1990},
  doi     = {10.1093/ajcn/51.2.241}
}

@book{ref_acsm2017,
  institution = {American College of Sports Medicine},
  title     = {ACSM's Guidelines for Exercise Testing and Prescription},
  edition   = {10th},
  address   = {Philadelphia, PA, USA},
  publisher = {Wolters Kluwer},
  year      = {2017}
}

@article{ref_nedeltcheva2010,
  author  = {A. V. Nedeltcheva and J. M. Kilkus and J. Imperial and D. A. Schoeller and P. D. Penev},
  title   = {Insufficient sleep undermines dietary efforts to reduce adiposity},
  journal = {Annals of Internal Medicine},
  volume  = {153},
  number  = {7},
  pages   = {435--441},
  year    = {2010},
  doi     = {10.7326/0003-4819-153-7-201010050-00006}
}

@article{ref_garthe2011,
  author  = {I. Garthe and T. Raastad and P. E. Refsnes and A. Koivisto and J. Sundgot-Borgen},
  title   = {Effect of two different weight-loss rates on body composition and strength and power-related performance in elite athletes},
  journal = {International Journal of Sport Nutrition and Exercise Metabolism},
  volume  = {21},
  number  = {2},
  pages   = {97--104},
  year    = {2011},
  doi     = {10.1123/ijsnem.21.2.97}
}

@article{ref_westerterp2004,
  author    = {K. R. Westerterp},
  title     = {Diet induced thermogenesis},
  journal   = {Nutrition \& Metabolism},
  volume    = {1},
  articleno = {5},
  year      = {2004},
  doi       = {10.1186/1743-7075-1-5}
}

@techreport{ref_who1995,
  institution = {World Health Organization},
  title       = {Physical status: the use and interpretation of anthropometry},
  type        = {Report of a WHO Expert Committee},
  number      = {WHO Technical Report Series 854},
  address     = {Geneva, Switzerland},
  year        = {1995}
}

@article{ref_chow2008,
  author    = {C. C. Chow and K. D. Hall},
  title     = {The dynamics of human body weight change},
  journal   = {PLoS Computational Biology},
  volume    = {4},
  number    = {3},
  articleno = {e1000045},
  year      = {2008},
  doi       = {10.1371/journal.pcbi.1000045}
}

@article{ref_olsson1970,
  author  = {K.-E. Olsson and B. Saltin},
  title   = {Variation in total body water with muscle glycogen changes in man},
  journal = {Acta Physiologica Scandinavica},
  volume  = {80},
  number  = {1},
  pages   = {11--18},
  year    = {1970},
  doi     = {10.1111/j.1748-1716.1970.tb04764.x}
}

@article{ref_helms2014,
  author  = {E. R. Helms and C. Zinn and D. S. Rowlands and S. R. Brown},
  title   = {A systematic review of dietary protein during caloric restriction in resistance trained lean athletes: a case for higher intakes},
  journal = {International Journal of Sport Nutrition and Exercise Metabolism},
  volume  = {24},
  number  = {2},
  pages   = {127--138},
  year    = {2014},
  doi     = {10.1123/ijsnem.2013-0054}
}

@book{ref_usda2020,
  institution = {U.S. Department of Agriculture and U.S. Department of Health and Human Services},
  title   = {Dietary Guidelines for Americans, 2020-2025},
  edition = {9th},
  address = {Washington, DC, USA},
  year    = {2020}
}

@book{ref_iom2005,
  author    = {Institute of Medicine},
  title     = {Dietary Reference Intakes for Energy, Carbohydrate, Fiber, Fat, Fatty Acids, Cholesterol, Protein, and Amino Acids},
  address   = {Washington, DC, USA},
  publisher = {National Academies Press},
  year      = {2005}
}
```
